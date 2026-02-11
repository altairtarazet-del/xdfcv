import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.auth import (
    verify_password, create_token, require_admin, require_role,
    hash_password, create_refresh_token, verify_refresh_token,
)
from app.config import settings
from app.database import get_db
from app.rate_limit import login_limiter, login_tracker

logger = logging.getLogger(__name__)

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def admin_login(body: LoginRequest, request: Request):
    tracker_key = f"admin:{body.username}"

    if login_tracker.is_locked(tracker_key):
        raise HTTPException(status_code=429, detail="Account locked due to too many failed attempts. Try again in 5 minutes.")

    if not login_limiter.is_allowed(tracker_key):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")

    db = get_db()
    rows = await db.select("admin_users", filters={"username": f"eq.{body.username}"})
    if not rows:
        login_tracker.record_failure(tracker_key)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    row = rows[0]

    if not row.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is disabled")

    if not verify_password(body.password, row["password_hash"]):
        login_tracker.record_failure(tracker_key)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    login_tracker.reset(tracker_key)

    # Update last login
    await db.update(
        "admin_users",
        {"last_login_at": datetime.now(timezone.utc).isoformat()},
        filters={"id": f"eq.{row['id']}"},
    )

    token = create_token(
        sub=row["username"],
        role="admin",
        extra={
            "admin_role": row.get("role", "admin"),
            "admin_id": row["id"],
            "display_name": row.get("display_name"),
        },
    )

    # Create refresh token
    raw_refresh, token_hash = create_refresh_token()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    await db.insert("refresh_tokens", {
        "user_id": row["id"],
        "user_type": "admin",
        "token_hash": token_hash,
        "expires_at": expires.isoformat(),
    })

    return {
        "token": token,
        "refresh_token": raw_refresh,
        "username": row["username"],
        "role": row.get("role", "admin"),
        "display_name": row.get("display_name"),
    }


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh")
async def refresh_token(body: RefreshRequest):
    """Exchange a refresh token for a new access token."""
    import hashlib
    token_hash = hashlib.sha256(body.refresh_token.encode()).hexdigest()

    db = get_db()
    rows = await db.select("refresh_tokens", filters={
        "token_hash": f"eq.{token_hash}",
        "revoked": "eq.false",
        "user_type": "eq.admin",
    })
    if not rows:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    rt = rows[0]
    if datetime.fromisoformat(rt["expires_at"]).replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired")

    # Get the admin user
    admin_rows = await db.select("admin_users", filters={"id": f"eq.{rt['user_id']}"})
    if not admin_rows or not admin_rows[0].get("is_active", True):
        raise HTTPException(status_code=401, detail="User not found or disabled")

    # Revoke old refresh token (token rotation)
    await db.update("refresh_tokens", {"revoked": True}, filters={"id": f"eq.{rt['id']}"})

    row = admin_rows[0]
    new_token = create_token(
        sub=row["username"],
        role="admin",
        extra={
            "admin_role": row.get("role", "admin"),
            "admin_id": row["id"],
            "display_name": row.get("display_name"),
        },
    )

    # Issue new refresh token
    new_raw_refresh, new_token_hash = create_refresh_token()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    await db.insert("refresh_tokens", {
        "user_id": rt["user_id"],
        "user_type": "admin",
        "token_hash": new_token_hash,
        "expires_at": expires.isoformat(),
    })

    return {"token": new_token, "refresh_token": new_raw_refresh}


@router.get("/me")
async def admin_me(payload: dict = Depends(require_admin)):
    return {
        "username": payload["sub"],
        "role": payload.get("admin_role", "admin"),
        "display_name": payload.get("display_name"),
    }


# --- Team Management (super_admin only) ---

class CreateAdminRequest(BaseModel):
    username: str
    password: str
    display_name: str | None = None
    role: str = "admin"


@router.get("/team")
async def list_admins(payload: dict = Depends(require_role("admin"))):
    db = get_db()
    rows = await db.select(
        "admin_users",
        columns="id,username,display_name,role,is_active,last_login_at,created_at",
        order="created_at.desc",
    )
    return {"admins": rows}


@router.post("/team")
async def create_admin(body: CreateAdminRequest, payload: dict = Depends(require_role("super_admin"))):
    if body.role not in ("super_admin", "admin", "viewer", "operator"):
        raise HTTPException(status_code=400, detail="Invalid role")
    db = get_db()
    try:
        rows = await db.insert("admin_users", {
            "username": body.username,
            "password_hash": hash_password(body.password),
            "display_name": body.display_name,
            "role": body.role,
        })
        row = rows[0]
        return {
            "id": row["id"],
            "username": row["username"],
            "display_name": row.get("display_name"),
            "role": row.get("role"),
        }
    except Exception:
        raise HTTPException(status_code=409, detail="Username already exists")


class UpdateAdminRequest(BaseModel):
    display_name: str | None = None
    role: str | None = None
    is_active: bool | None = None


@router.patch("/team/{admin_id}")
async def update_admin(admin_id: str, body: UpdateAdminRequest, payload: dict = Depends(require_role("super_admin"))):
    db = get_db()
    data = {}
    if body.display_name is not None:
        data["display_name"] = body.display_name
    if body.role is not None:
        if body.role not in ("super_admin", "admin", "viewer", "operator"):
            raise HTTPException(status_code=400, detail="Invalid role")
        data["role"] = body.role
    if body.is_active is not None:
        data["is_active"] = body.is_active
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.update("admin_users", data, filters={"id": f"eq.{admin_id}"})
    if not result:
        raise HTTPException(status_code=404, detail="Admin not found")
    return result[0]


@router.delete("/team/{admin_id}")
async def delete_admin(admin_id: str, payload: dict = Depends(require_role("super_admin"))):
    # Prevent deleting yourself
    if payload.get("admin_id") == admin_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db = get_db()
    result = await db.delete("admin_users", filters={"id": f"eq.{admin_id}"})
    if not result:
        raise HTTPException(status_code=404, detail="Admin not found")
    return {"ok": True}
