import asyncio
import json
import traceback
from datetime import datetime, timezone

from app.database import get_db
from app.services.smtp_client import SmtpDevClient
from app.services.stage_detector import detect_stage_from_messages, check_bgc_body, STAGE_PRIORITY

BATCH_SIZE = 10


async def scan_all_accounts(scan_id: int):
    """Main scan orchestrator. Runs as a background task."""
    db = get_db()
    client = SmtpDevClient()
    errors_list = []
    scanned = 0
    transitions = 0

    try:
        # 1. Fetch all SMTP.dev accounts and sync to DB
        smtp_accounts = await client.get_all_accounts()
        for acc in smtp_accounts:
            existing = await db.select("accounts", filters={"smtp_account_id": f"eq.{acc['id']}"})
            if not existing:
                await db.insert("accounts", {
                    "smtp_account_id": acc["id"],
                    "email": acc["email"],
                })

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
        for i in range(0, len(db_accounts), BATCH_SIZE):
            batch = db_accounts[i : i + BATCH_SIZE]
            results = await asyncio.gather(
                *[scan_single_account(acc, smtp_map, client, db) for acc in batch],
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


async def scan_single_account(db_account: dict, smtp_map: dict, client: SmtpDevClient, db) -> bool:
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
    else:
        await db.update(
            "accounts",
            {"last_scanned_at": now, "scan_error": None},
            filters={"id": f"eq.{db_account['id']}"},
        )

    return stage_changed
