from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import verify_password, create_token, require_portal, create_refresh_token, hash_password
from app.config import settings
from app.database import get_db
from app.rate_limit import login_limiter
from app.services.smtp_client import SmtpDevClient

router = APIRouter()


class PortalLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def portal_login(body: PortalLoginRequest):
    if not login_limiter.is_allowed(f"portal:{body.email}"):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")

    db = get_db()
    rows = await db.select("portal_users", filters={"email": f"eq.{body.email}"})
    if not rows:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    row = rows[0]

    if not row.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is disabled")

    if not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await db.update(
        "portal_users",
        {"last_login_at": datetime.now(timezone.utc).isoformat()},
        filters={"id": f"eq.{row['id']}"},
    )
    token = create_token(
        sub=row["email"],
        role="portal",
        extra={"display_name": row.get("display_name"), "account_id": row.get("account_id")},
    )

    # Create refresh token
    raw_refresh, token_hash = create_refresh_token()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    await db.insert("refresh_tokens", {
        "user_id": row["id"],
        "user_type": "portal",
        "token_hash": token_hash,
        "expires_at": expires.isoformat(),
    })

    return {
        "token": token,
        "refresh_token": raw_refresh,
        "email": row["email"],
        "display_name": row.get("display_name"),
    }


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh")
async def refresh_token(body: RefreshRequest):
    import hashlib
    token_hash = hashlib.sha256(body.refresh_token.encode()).hexdigest()

    db = get_db()
    rows = await db.select("refresh_tokens", filters={
        "token_hash": f"eq.{token_hash}",
        "revoked": "eq.false",
        "user_type": "eq.portal",
    })
    if not rows:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    rt = rows[0]
    if datetime.fromisoformat(rt["expires_at"]).replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired")

    user_rows = await db.select("portal_users", filters={"id": f"eq.{rt['user_id']}"})
    if not user_rows or not user_rows[0].get("is_active", True):
        raise HTTPException(status_code=401, detail="User not found or disabled")

    row = user_rows[0]
    new_token = create_token(
        sub=row["email"],
        role="portal",
        extra={"display_name": row.get("display_name"), "account_id": row.get("account_id")},
    )
    return {"token": new_token}


@router.get("/me")
async def portal_me(payload: dict = Depends(require_portal)):
    return {
        "email": payload["sub"],
        "role": "portal",
        "display_name": payload.get("display_name"),
        "account_id": payload.get("account_id"),
    }


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def portal_change_password(body: ChangePasswordRequest, payload: dict = Depends(require_portal)):
    db = get_db()
    email = payload["sub"]
    rows = await db.select("portal_users", filters={"email": f"eq.{email}"})
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    user = rows[0]

    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    # Update portal password
    await db.update(
        "portal_users",
        {"password_hash": hash_password(body.new_password)},
        filters={"email": f"eq.{email}"},
    )

    # Sync to SMTP.dev
    accounts = await db.select("accounts", filters={"email": f"eq.{email}"})
    if accounts:
        try:
            client = SmtpDevClient()
            await client.update_password(accounts[0]["smtp_account_id"], body.new_password)
        except Exception:
            pass  # Log but don't fail the request

    return {"ok": True}
