import asyncio
import logging
import secrets
import traceback
from datetime import datetime, timezone

from app.database import get_db
from app.auth import hash_password
from app.config import settings
from app.services.smtp_client import SmtpDevClient
from app.services.stage_detector import detect_stage_from_messages, check_bgc_body, STAGE_PRIORITY
from app.services.email_classifier import classify_with_threshold
from app.services.name_extractor import extract_names_for_account
from app.services.template_fingerprint import TemplateCache, make_fingerprint
from app.utils import mask_email

logger = logging.getLogger(__name__)

BATCH_SIZE = 10

# Alert-triggering categories
ALERT_CATEGORIES = {
    ("account", "deactivation"): ("deactivation", "critical"),
    ("warning", "contract_violation"): ("contract_violation", "critical"),
    ("warning", "low_rating_warning"): ("low_rating", "warning"),
}


async def scan_all_accounts(scan_id: int):
    """Main scan orchestrator. Runs as a background task."""
    db = get_db()
    client = SmtpDevClient()
    template_cache = TemplateCache()
    errors_list = []
    scanned = 0
    transitions = 0

    try:
        # 1. Fetch all SMTP.dev accounts and sync to DB + create portal users
        smtp_accounts = await client.get_all_accounts()
        for acc in smtp_accounts:
            existing = await db.select("accounts", filters={"smtp_account_id": f"eq.{acc['id']}"})
            if not existing:
                rows = await db.insert("accounts", {
                    "smtp_account_id": acc["id"],
                    "email": acc["email"],
                })
                # Auto-create portal user for new account
                await _ensure_portal_user(db, acc["email"], rows[0]["id"])
                # Try to extract names for new account
                try:
                    names = await extract_names_for_account(db, client, rows[0])
                    if names:
                        update_data = {}
                        if names.get("first_name"):
                            update_data["first_name"] = names["first_name"]
                        if names.get("last_name"):
                            update_data["last_name"] = names["last_name"]
                        if update_data:
                            await db.update("accounts", update_data, filters={"id": f"eq.{rows[0]['id']}"})
                except Exception as e:
                    logger.warning(f"Name extraction failed for {mask_email(acc['email'])}: {e}")

        await db.update(
            "scan_logs",
            {"total_accounts": len(smtp_accounts)},
            filters={"id": f"eq.{scan_id}"},
        )

        # 2. Get all accounts from DB
        db_accounts = await db.select("accounts")
        # Build smtp_account_id -> smtp data map
        smtp_map = {a["id"]: a for a in smtp_accounts}

        # 3. Process in batches
        total = len(db_accounts)
        for i in range(0, total, BATCH_SIZE):
            batch = db_accounts[i : i + BATCH_SIZE]
            # Update progress before batch
            await db.update(
                "scan_logs",
                {
                    "scanned": scanned,
                    "errors": len(errors_list),
                    "transitions": transitions,
                    "current_account": batch[0].get("email", ""),
                },
                filters={"id": f"eq.{scan_id}"},
            )
            results = await asyncio.gather(
                *[scan_single_account(acc, smtp_map, client, db, template_cache) for acc in batch],
                return_exceptions=True,
            )
            for acc, result in zip(batch, results):
                if isinstance(result, Exception):
                    errors_list.append({"email": acc["email"], "error": str(result)})
                    await db.update(
                        "accounts",
                        {
                            "scan_error": str(result),
                            "last_scanned_at": datetime.now(timezone.utc).isoformat(),
                        },
                        filters={"id": f"eq.{acc['id']}"},
                    )
                else:
                    scanned += 1
                    if result:
                        transitions += 1

        logger.info(f"Scan template cache: {template_cache.stats}")

        # 4. Update scan log as completed
        await db.update(
            "scan_logs",
            {
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "scanned": scanned,
                "errors": len(errors_list),
                "transitions": transitions,
                "status": "completed",
                "error_details": errors_list if errors_list else None,
            },
            filters={"id": f"eq.{scan_id}"},
        )
    except Exception as e:
        await db.update(
            "scan_logs",
            {
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "scanned": scanned,
                "errors": len(errors_list) + 1,
                "transitions": transitions,
                "status": "failed",
                "error_details": errors_list + [{"fatal": str(e), "trace": traceback.format_exc()}],
            },
            filters={"id": f"eq.{scan_id}"},
        )


async def scan_single_account(db_account: dict, smtp_map: dict, client: SmtpDevClient, db, template_cache: TemplateCache | None = None) -> bool:
    """Scan a single account's emails and update its stage. Returns True if stage changed."""
    smtp_id = db_account["smtp_account_id"]
    smtp_data = smtp_map.get(smtp_id, {})

    # Use mailbox IDs from account data
    mb_ids = [
        mid for mid in [
            smtp_data.get("inbox_id"),
            smtp_data.get("trash_id"),
            smtp_data.get("junk_id"),
        ] if mid
    ]

    now = datetime.now(timezone.utc).isoformat()

    if not mb_ids:
        await db.update(
            "accounts",
            {"last_scanned_at": now, "scan_error": None},
            filters={"id": f"eq.{db_account['id']}"},
        )
        return False

    # Fetch all message headers
    messages = await client.get_all_messages_headers(smtp_id, mb_ids)

    # Detect stage
    new_stage, trigger_subject, trigger_date, needs_body_check = detect_stage_from_messages(messages)

    # If we need to check bodies (BGC complete emails)
    if needs_body_check and new_stage in ("BGC_CLEAR", "BGC_CONSIDER"):
        for msg in needs_body_check:
            msg_path = msg.get("@id") or msg.get("id")
            if msg_path:
                full_msg = await client.get_message(msg_path)
                if full_msg:
                    body = full_msg.get("html", "") or full_msg.get("text", "")
                    body_stage = check_bgc_body(body)
                    if STAGE_PRIORITY[body_stage] > STAGE_PRIORITY[new_stage]:
                        new_stage = body_stage
                        trigger_subject = msg.get("subject")
                        trigger_date = msg.get("date", msg.get("created_at"))

    old_stage = db_account["stage"]
    stage_changed = new_stage != old_stage and STAGE_PRIORITY[new_stage] > STAGE_PRIORITY[old_stage]

    if stage_changed:
        await db.update(
            "accounts",
            {
                "stage": new_stage,
                "stage_updated_at": now,
                "last_scanned_at": now,
                "scan_error": None,
                "updated_at": now,
            },
            filters={"id": f"eq.{db_account['id']}"},
        )
        await db.insert("stage_history", {
            "account_id": db_account["id"],
            "old_stage": old_stage,
            "new_stage": new_stage,
            "trigger_email_subject": trigger_subject,
            "trigger_email_date": trigger_date,
        })

        # Create alert for stage change
        await _create_stage_alert(db, db_account, old_stage, new_stage, trigger_subject)
    else:
        await db.update(
            "accounts",
            {"last_scanned_at": now, "scan_error": None},
            filters={"id": f"eq.{db_account['id']}"},
        )

    # Run email classification on recent messages (top 20)
    await _classify_recent_emails(db, db_account, messages[:20], template_cache)

    return stage_changed


async def _create_stage_alert(db, account: dict, old_stage: str, new_stage: str, trigger_subject: str | None):
    """Create an alert for a stage transition."""
    severity = "info"
    alert_type = "stage_change"

    if new_stage == "DEACTIVATED":
        severity = "critical"
        alert_type = "deactivation"
    elif new_stage == "BGC_CONSIDER":
        severity = "warning"
    elif new_stage == "ACTIVE":
        severity = "info"

    await db.insert("alerts", {
        "account_id": account["id"],
        "alert_type": alert_type,
        "severity": severity,
        "title": f"{account['email']}: {old_stage} → {new_stage}",
        "message": trigger_subject,
    })


async def _classify_recent_emails(db, account: dict, messages: list[dict], template_cache: TemplateCache | None = None):
    """Classify recent emails and create alerts for critical ones."""
    # 1. Collect message IDs
    msg_entries = []
    for msg in messages:
        msg_id = str(msg.get("@id") or msg.get("id", ""))
        if msg_id:
            msg_entries.append((msg_id, msg))
    if not msg_entries:
        return

    # 2. Batch DB check — single query instead of N queries
    all_ids = [mid for mid, _ in msg_entries]
    existing = await db.select("email_analyses", filters={
        "account_id": f"eq.{account['id']}",
        "message_id": f"in.({','.join(all_ids)})",
    })
    already_classified = {e["message_id"] for e in existing}

    # 3. Process each message
    for msg_id, msg in msg_entries:
        if msg_id in already_classified:
            continue

        subject = msg.get("subject", "")
        sender = msg.get("from", msg.get("sender", ""))
        fingerprint = make_fingerprint(subject, sender)

        # Template cache hit?
        cached = template_cache.get(fingerprint) if template_cache else None
        if cached:
            source = cached["analysis_source"]
            if not source.endswith("_dedup"):
                source = source + "_dedup"
            result_data = {
                **cached,
                "account_id": account["id"],
                "message_id": msg_id,
                "analysis_source": source,
            }
            try:
                await db.insert("email_analyses", result_data, on_conflict="account_id,message_id")
            except Exception:
                pass
            await _maybe_create_alert_from_data(db, account, result_data, subject)
            continue

        # Normal classification
        result, needs_ai = classify_with_threshold(subject, sender)
        if result is None:
            continue  # Skip unclassifiable during batch scan

        analysis_data = {
            "account_id": account["id"],
            "message_id": msg_id,
            "category": result.category,
            "sub_category": result.sub_category,
            "confidence": result.confidence,
            "analysis_source": "rules",
            "summary": result.summary,
            "urgency": result.urgency,
            "action_required": result.action_required,
        }

        # Store in template cache BEFORE await to benefit concurrent coroutines
        if template_cache:
            template_cache.put(fingerprint, {
                "category": result.category,
                "sub_category": result.sub_category,
                "confidence": result.confidence,
                "analysis_source": "rules",
                "summary": result.summary,
                "urgency": result.urgency,
                "action_required": result.action_required,
            })

        try:
            await db.insert("email_analyses", analysis_data, on_conflict="account_id,message_id")
        except Exception:
            pass

        await _maybe_create_alert(db, account, result, subject)


async def _maybe_create_alert(db, account: dict, result, subject: str):
    """Create an alert if the classification matches alert-triggering categories."""
    alert_key = (result.category, result.sub_category)
    if alert_key in ALERT_CATEGORIES:
        a_type, a_severity = ALERT_CATEGORIES[alert_key]
        await db.insert("alerts", {
            "account_id": account["id"],
            "alert_type": a_type,
            "severity": a_severity,
            "title": f"{account['email']}: {result.summary}",
            "message": subject,
        })


async def _maybe_create_alert_from_data(db, account: dict, data: dict, subject: str):
    """Create an alert from raw classification data dict (for dedup'd results)."""
    alert_key = (data.get("category"), data.get("sub_category"))
    if alert_key in ALERT_CATEGORIES:
        a_type, a_severity = ALERT_CATEGORIES[alert_key]
        await db.insert("alerts", {
            "account_id": account["id"],
            "alert_type": a_type,
            "severity": a_severity,
            "title": f"{account['email']}: {data.get('summary', '')}",
            "message": subject,
        })


async def _ensure_portal_user(db, email: str, account_id: str):
    """Create portal user for an account if not exists. Also syncs SMTP.dev password."""
    existing = await db.select("portal_users", filters={"email": f"eq.{email}"})
    if existing:
        return
    try:
        password = secrets.token_urlsafe(12)
        await db.insert("portal_users", {
            "email": email,
            "password_hash": hash_password(password),
            "display_name": email.split("@")[0],
            "account_id": account_id,
            "is_active": True,
        })
        # Sync password to SMTP.dev
        accounts = await db.select("accounts", filters={"email": f"eq.{email}"})
        if accounts:
            smtp_client = SmtpDevClient()
            await smtp_client.update_password(accounts[0]["smtp_account_id"], password)
        logger.info(f"Auto-created portal user for {mask_email(email)}")
    except Exception as e:
        logger.warning(f"Failed to create portal user for {mask_email(email)}: {e}")


async def auto_sync_accounts():
    """Periodically sync SMTP.dev accounts to DB and create portal users."""
    while True:
        try:
            await asyncio.sleep(settings.sync_interval_seconds)
            db = get_db()
            client = SmtpDevClient()
            smtp_accounts = await client.get_all_accounts()
            created = 0
            for acc in smtp_accounts:
                existing = await db.select("accounts", filters={"smtp_account_id": f"eq.{acc['id']}"})
                if not existing:
                    rows = await db.insert("accounts", {
                        "smtp_account_id": acc["id"],
                        "email": acc["email"],
                    })
                    await _ensure_portal_user(db, acc["email"], rows[0]["id"])
                    # Try to extract names for new account
                    try:
                        names = await extract_names_for_account(db, client, rows[0])
                        if names:
                            update_data = {}
                            if names.get("first_name"):
                                update_data["first_name"] = names["first_name"]
                            if names.get("last_name"):
                                update_data["last_name"] = names["last_name"]
                            if update_data:
                                await db.update("accounts", update_data, filters={"id": f"eq.{rows[0]['id']}"})
                    except Exception as e:
                        logger.warning(f"Name extraction failed for {mask_email(acc['email'])}: {e}")
                    created += 1
            if created:
                logger.info(f"Auto-sync: {created} new accounts provisioned")
        except Exception as e:
            logger.error(f"Auto-sync error: {e}")
