from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import verify_password, create_token, require_portal, create_refresh_token
from app.config import settings
from app.database import get_db
from app.rate_limit import login_limiter

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
