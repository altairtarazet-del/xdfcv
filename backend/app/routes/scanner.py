import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_admin
from app.database import get_db
from app.services.scanner import scan_all_accounts
from app.services.smtp_client import SmtpDevClient

router = APIRouter()


@router.post("/scan")
async def start_scan(_=Depends(require_admin)):
    db = get_db()
    rows = await db.insert("scan_logs", {"status": "running"})
    scan_id = rows[0]["id"]
    # Fire-and-forget background scan
    asyncio.create_task(scan_all_accounts(scan_id))
    return {"scan_id": scan_id, "status": "running"}


@router.get("/scan/{scan_id}")
async def scan_status(scan_id: int, _=Depends(require_admin)):
    db = get_db()
    rows = await db.select("scan_logs", filters={"id": f"eq.{scan_id}"})
    if not rows:
        raise HTTPException(status_code=404, detail="Scan not found")
    return rows[0]


@router.post("/accounts/sync")
async def sync_accounts(_=Depends(require_admin)):
    """Sync SMTP.dev accounts to local DB without scanning emails."""
    db = get_db()
    client = SmtpDevClient()
    accounts = await client.get_all_accounts()
    created = 0
    for acc in accounts:
        existing = await db.select("accounts", filters={"smtp_account_id": f"eq.{acc['id']}"})
        if not existing:
            await db.insert("accounts", {"smtp_account_id": acc["id"], "email": acc["email"]})
            created += 1
    return {"total_fetched": len(accounts), "newly_created": created}


class NotesUpdate(BaseModel):
    notes: str


@router.patch("/accounts/{email}/notes")
async def update_notes(email: str, body: NotesUpdate, _=Depends(require_admin)):
    db = get_db()
    result = await db.update("accounts", {"notes": body.notes}, filters={"email": f"eq.{email}"})
    if not result:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True}
