import asyncio
import json
import traceback
from datetime import datetime, timezone

from app.database import get_pool
from app.services.smtp_client import SmtpDevClient
from app.services.stage_detector import detect_stage_from_messages, check_bgc_body, STAGE_PRIORITY

BATCH_SIZE = 10


async def scan_all_accounts(scan_id: int):
    """Main scan orchestrator. Runs as a background task."""
    pool = get_pool()
    client = SmtpDevClient()
    errors_list = []
    scanned = 0
    transitions = 0

    try:
        # 1. Fetch all SMTP.dev accounts and sync to DB
        smtp_accounts = await client.get_all_accounts()
        for acc in smtp_accounts:
            await pool.execute(
                """INSERT INTO accounts (smtp_account_id, email)
                   VALUES ($1, $2)
                   ON CONFLICT (smtp_account_id) DO NOTHING""",
                acc["id"], acc["email"],
            )

        await pool.execute(
            "UPDATE scan_logs SET total_accounts = $1 WHERE id = $2",
            len(smtp_accounts), scan_id,
        )

        # 2. Get all accounts from DB
        db_accounts = await pool.fetch("SELECT * FROM accounts")
        # Build smtp_account_id -> smtp data map
        smtp_map = {a["id"]: a for a in smtp_accounts}

        # 3. Process in batches
        for i in range(0, len(db_accounts), BATCH_SIZE):
            batch = db_accounts[i : i + BATCH_SIZE]
            results = await asyncio.gather(
                *[scan_single_account(acc, smtp_map, client, pool) for acc in batch],
                return_exceptions=True,
            )
            for acc, result in zip(batch, results):
                if isinstance(result, Exception):
                    errors_list.append({"email": acc["email"], "error": str(result)})
                    await pool.execute(
                        "UPDATE accounts SET scan_error = $1, last_scanned_at = NOW() WHERE id = $2",
                        str(result), acc["id"],
                    )
                else:
                    scanned += 1
                    if result:  # result = True means stage changed
                        transitions += 1

        # 4. Update scan log as completed
        await pool.execute(
            """UPDATE scan_logs
               SET finished_at = NOW(), scanned = $1, errors = $2, transitions = $3,
                   status = 'completed', error_details = $4::jsonb
               WHERE id = $5""",
            scanned, len(errors_list), transitions,
            json.dumps(errors_list) if errors_list else None,
            scan_id,
        )
    except Exception as e:
        await pool.execute(
            """UPDATE scan_logs
               SET finished_at = NOW(), scanned = $1, errors = $2, transitions = $3,
                   status = 'failed', error_details = $4::jsonb
               WHERE id = $5""",
            scanned, len(errors_list) + 1, transitions,
            json.dumps(errors_list + [{"fatal": str(e), "trace": traceback.format_exc()}]),
            scan_id,
        )


async def scan_single_account(
    db_account: dict, smtp_map: dict, client: SmtpDevClient, pool
) -> bool:
    """
    Scan a single account's emails and update its stage.
    Returns True if stage changed.
    """
    smtp_id = db_account["smtp_account_id"]
    smtp_data = smtp_map.get(smtp_id, {})

    # Use mailbox IDs directly from account data (inbox_id, trash_id, junk_id)
    mb_ids = [
        mid for mid in [
            smtp_data.get("inbox_id"),
            smtp_data.get("trash_id"),
            smtp_data.get("junk_id"),
        ] if mid
    ]

    if not mb_ids:
        # No relevant mailboxes — could be new account, just update scan time
        await pool.execute(
            "UPDATE accounts SET last_scanned_at = NOW(), scan_error = NULL WHERE id = $1",
            db_account["id"],
        )
        return False

    # Fetch all message headers
    messages = await client.get_all_messages_headers(smtp_id, mb_ids)

    # Detect stage
    new_stage, trigger_subject, trigger_date, needs_body_check = detect_stage_from_messages(messages)

    # If we need to check bodies (BGC complete emails)
    if needs_body_check and new_stage in ("BGC_CLEAR", "BGC_CONSIDER"):
        for msg in needs_body_check:
            # Use @id path for full message fetch
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
        await pool.execute(
            """UPDATE accounts
               SET stage = $1, stage_updated_at = NOW(), last_scanned_at = NOW(),
                   scan_error = NULL, updated_at = NOW()
               WHERE id = $2""",
            new_stage, db_account["id"],
        )
        await pool.execute(
            """INSERT INTO stage_history (account_id, old_stage, new_stage, trigger_email_subject, trigger_email_date)
               VALUES ($1, $2, $3, $4, $5)""",
            db_account["id"], old_stage, new_stage, trigger_subject, trigger_date,
        )
    else:
        await pool.execute(
            "UPDATE accounts SET last_scanned_at = NOW(), scan_error = NULL WHERE id = $1",
            db_account["id"],
        )

    return stage_changed
