from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.auth import require_portal
from app.services.smtp_client import SmtpDevClient

router = APIRouter()


@router.get("/mailboxes")
async def list_mailboxes(payload: dict = Depends(require_portal)):
    """List mailboxes for the logged-in portal user's email."""
    client = SmtpDevClient()
    account = await client.find_account_by_email(payload["sub"])
    if not account:
        raise HTTPException(status_code=404, detail="SMTP account not found")
    mailboxes = await client.get_mailboxes(account["id"])
    return {"mailboxes": mailboxes}


@router.get("/mailboxes/{mailbox_id}/messages")
async def list_messages(
    mailbox_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    payload: dict = Depends(require_portal),
):
    """List messages in a mailbox (paginated)."""
    client = SmtpDevClient()
    # Verify ownership: get account for this portal user, then verify mailbox belongs to them
    account = await client.find_account_by_email(payload["sub"])
    if not account:
        raise HTTPException(status_code=404, detail="SMTP account not found")
    messages = await client.get_messages(account["id"], mailbox_id, page=page, per_page=per_page)
    return messages


@router.get("/mailboxes/{mailbox_id}/messages/{message_id}")
async def get_message(
    mailbox_id: str,
    message_id: str,
    payload: dict = Depends(require_portal),
):
    """Get a single message with full body."""
    client = SmtpDevClient()
    account = await client.find_account_by_email(payload["sub"])
    if not account:
        raise HTTPException(status_code=404, detail="SMTP account not found")
    message = await client.get_message(
        message_id, account_id=account["id"], mailbox_id=mailbox_id
    )
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    return message


@router.get("/mailboxes/{mailbox_id}/messages/{message_id}/attachments/{attachment_id}")
async def portal_attachment(
    mailbox_id: str,
    message_id: str,
    attachment_id: str,
    payload: dict = Depends(require_portal),
):
    """Download an email attachment for portal user."""
    client = SmtpDevClient()
    account = await client.find_account_by_email(payload["sub"])
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
