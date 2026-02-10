import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_admin
from app.database import get_pool
from app.services.scanner import scan_all_accounts
from app.services.smtp_client import SmtpDevClient

router = APIRouter()


@router.post("/scan")
async def start_scan(_=Depends(require_admin)):
    pool = get_pool()
    scan_id = await pool.fetchval(
        "INSERT INTO scan_logs (status) VALUES ('running') RETURNING id"
    )
    # Fire-and-forget background scan
    asyncio.create_task(scan_all_accounts(scan_id))
    return {"scan_id": scan_id, "status": "running"}


@router.get("/scan/{scan_id}")
async def scan_status(scan_id: int, _=Depends(require_admin)):
    pool = get_pool()
    row = await pool.fetchrow("SELECT * FROM scan_logs WHERE id = $1", scan_id)
    if not row:
        raise HTTPException(status_code=404, detail="Scan not found")
    return dict(row)


@router.post("/accounts/sync")
async def sync_accounts(_=Depends(require_admin)):
    """Sync SMTP.dev accounts to local DB without scanning emails."""
    pool = get_pool()
    client = SmtpDevClient()
    accounts = await client.get_all_accounts()
    created = 0
    for acc in accounts:
        result = await pool.execute(
            """INSERT INTO accounts (smtp_account_id, email)
               VALUES ($1, $2)
               ON CONFLICT (smtp_account_id) DO NOTHING""",
            acc["id"], acc["email"],
        )
        if "INSERT" in result:
            created += 1
    return {"total_fetched": len(accounts), "newly_created": created}


class NotesUpdate(BaseModel):
    notes: str


@router.patch("/accounts/{email}/notes")
async def update_notes(email: str, body: NotesUpdate, _=Depends(require_admin)):
    pool = get_pool()
    result = await pool.execute(
        "UPDATE accounts SET notes = $1, updated_at = NOW() WHERE email = $2",
        body.notes, email,
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True}
