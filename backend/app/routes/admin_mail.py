"""Admin routes for viewing customer emails."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.auth import require_admin
from app.services.smtp_client import SmtpDevClient

router = APIRouter()

# Subjects hidden from operator role
OPERATOR_HIDDEN_SUBJECTS = ["start your background check"]


def _is_operator(payload: dict) -> bool:
    return payload.get("admin_role") == "operator"


def _subject_hidden(subject: str) -> bool:
    return any(h in (subject or "").lower() for h in OPERATOR_HIDDEN_SUBJECTS)


@router.get("/customer-emails/{email}/mailboxes")
async def customer_mailboxes(email: str, payload: dict = Depends(require_admin)):
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
    payload: dict = Depends(require_admin),
):
    """List messages in a customer's mailbox."""
    client = SmtpDevClient()
    account = await client.find_account_by_email(email)
    if not account:
        raise HTTPException(status_code=404, detail="SMTP account not found")
    messages = await client.get_messages(account["id"], mailbox_id, page=page, per_page=per_page)
    # Filter hidden subjects for operator role
    if _is_operator(payload) and isinstance(messages, dict) and "data" in messages:
        messages["data"] = [m for m in messages["data"] if not _subject_hidden(m.get("subject", ""))]
    return messages


@router.get("/customer-emails/{email}/mailboxes/{mailbox_id}/messages/{message_id}")
async def customer_message(
    email: str,
    mailbox_id: str,
    message_id: str,
    payload: dict = Depends(require_admin),
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
    # Block operator from viewing hidden messages
    if _is_operator(payload) and _subject_hidden(message.get("subject", "")):
        raise HTTPException(status_code=403, detail="Access denied")
    return message


@router.get("/customer-emails/{email}/mailboxes/{mailbox_id}/messages/{message_id}/attachments/{attachment_id}")
async def customer_attachment(
    email: str,
    mailbox_id: str,
    message_id: str,
    attachment_id: str,
    payload: dict = Depends(require_admin),
):
    """Download a customer email attachment."""
    client = SmtpDevClient()
    account = await client.find_account_by_email(email)
    if not account:
        raise HTTPException(status_code=404, detail="SMTP account not found")
    try:
        content, content_type, filename = await client.get_attachment(
            account["id"], mailbox_id, message_id, attachment_id
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
