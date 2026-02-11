"""
Customer provisioning service.
Creates SMTP.dev account + DB records + portal user in one step.
"""
import secrets
import string
import logging
from datetime import datetime, timezone

from app.database import get_db
from app.auth import hash_password
from app.services.smtp_client import SmtpDevClient

logger = logging.getLogger(__name__)


def generate_password(length: int = 12) -> str:
    """Generate a random password."""
    chars = string.ascii_letters + string.digits
    return "".join(secrets.choice(chars) for _ in range(length))


async def provision_customer(
    email: str,
    customer_name: str | None = None,
    first_name: str | None = None,
    middle_name: str | None = None,
    last_name: str | None = None,
    date_of_birth: str | None = None,
    phone: str | None = None,
    admin_id: str | None = None,
) -> dict:
    """
    Provision a new customer in one step:
    1. Create SMTP.dev account
    2. Create DB account record
    3. Create portal user
    4. Create audit log entry

    Returns dict with all credentials (shown once).
    """
    db = get_db()
    client = SmtpDevClient()

    # Check if account already exists
    existing = await db.select("accounts", filters={"email": f"eq.{email}"})
    if existing:
        raise ValueError(f"Account already exists for {email}")

    # 1. Create SMTP.dev account
    smtp_account = await client.create_account(email)
    smtp_account_id = smtp_account.get("id", smtp_account.get("@id", ""))
    # Clean @id paths (e.g., "/accounts/abc123" -> "abc123")
    if isinstance(smtp_account_id, str) and "/" in smtp_account_id:
        smtp_account_id = smtp_account_id.split("/")[-1]

    # 2. Create DB account record
    account_data = {
        "smtp_account_id": smtp_account_id,
        "email": email,
        "customer_name": customer_name,
        "first_name": first_name,
        "middle_name": middle_name,
        "last_name": last_name,
        "date_of_birth": date_of_birth,
        "phone": phone,
        "status": "active",
    }
    if admin_id:
        account_data["assigned_admin_id"] = admin_id

    account_rows = await db.insert("accounts", account_data)
    account = account_rows[0]

    # 3. Create portal user with random password
    portal_password = generate_password()
    portal_rows = await db.insert("portal_users", {
        "email": email,
        "password_hash": hash_password(portal_password),
        "display_name": customer_name,
        "account_id": account["id"],
    })
    portal_user = portal_rows[0]

    # 4. Audit log
    await db.insert("audit_logs", {
        "admin_id": admin_id,
        "action": "provision_customer",
        "entity_type": "account",
        "entity_id": account["id"],
        "details": {
            "email": email,
            "customer_name": customer_name,
            "smtp_account_id": smtp_account_id,
        },
    })

    return {
        "account": account,
        "portal_user": {
            "email": portal_user["email"],
            "display_name": portal_user.get("display_name"),
        },
        "credentials": {
            "email": email,
            "portal_password": portal_password,
        },
        "smtp_account_id": smtp_account_id,
    }
