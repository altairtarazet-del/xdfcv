"""Admin routes for viewing customer emails."""
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_admin
from app.services.smtp_client import SmtpDevClient

router = APIRouter()


@router.get("/customer-emails/{email}/mailboxes")
async def customer_mailboxes(email: str, _=Depends(require_admin)):
    """List mailboxes for a customer's email account."""
    client = SmtpDevClient()
    account = await client.find_account_by_email(email)
    if not account:
        raise HTTPException(status_code=404, detail="SMTP account not found")
    mailboxes = await client.get_mailboxes(account["id"])
    return {"mailboxes": mailboxes}


@router.get("/customer-emails/{email}/mailboxes/{mailbox_id}/messages")
async def customer_messages(
    email: str,
    mailbox_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    _=Depends(require_admin),
):
    """List messages in a customer's mailbox."""
    client = SmtpDevClient()
    account = await client.find_account_by_email(email)
    if not account:
        raise HTTPException(status_code=404, detail="SMTP account not found")
    messages = await client.get_messages(account["id"], mailbox_id, page=page, per_page=per_page)
    return messages


@router.get("/customer-emails/{email}/mailboxes/{mailbox_id}/messages/{message_id}")
async def customer_message(
    email: str,
    mailbox_id: str,
    message_id: str,
    _=Depends(require_admin),
):
    """Get a single customer message with full body."""
    client = SmtpDevClient()
    account = await client.find_account_by_email(email)
    if not account:
        raise HTTPException(status_code=404, detail="SMTP account not found")
    message = await client.get_message(
        message_id, account_id=account["id"], mailbox_id=mailbox_id
    )
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    return message
