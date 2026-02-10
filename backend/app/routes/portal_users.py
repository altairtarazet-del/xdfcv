from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth import require_admin, hash_password
from app.database import get_db

router = APIRouter()


@router.get("/")
async def list_portal_users(
    search: str | None = Query(None),
    _=Depends(require_admin),
):
    db = get_db()
    filters = {}
    if search:
        filters["email"] = f"ilike.*{search}*"
    rows = await db.select(
        "portal_users",
        columns="id,email,display_name,account_id,is_active,last_login_at,created_at",
        filters=filters if filters else None,
        order="created_at.desc",
    )
    return {"users": rows}


class CreatePortalUser(BaseModel):
    email: str
    password: str
    display_name: str | None = None
    account_id: str | None = None


@router.post("/")
async def create_portal_user(body: CreatePortalUser, _=Depends(require_admin)):
    db = get_db()
    data = {
        "email": body.email,
        "password_hash": hash_password(body.password),
        "display_name": body.display_name,
    }
    if body.account_id:
        data["account_id"] = body.account_id
    try:
        rows = await db.insert("portal_users", data)
        return rows[0]
    except Exception:
        raise HTTPException(status_code=409, detail="Email already exists")


class UpdatePortalUser(BaseModel):
    display_name: str | None = None
    is_active: bool | None = None
    password: str | None = None
    account_id: str | None = None


@router.patch("/{email}")
async def update_portal_user(email: str, body: UpdatePortalUser, _=Depends(require_admin)):
    db = get_db()
    data = {}
    if body.display_name is not None:
        data["display_name"] = body.display_name
    if body.is_active is not None:
        data["is_active"] = body.is_active
    if body.password is not None:
        data["password_hash"] = hash_password(body.password)
    if body.account_id is not None:
        data["account_id"] = body.account_id if body.account_id else None
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.update("portal_users", data, filters={"email": f"eq.{email}"})
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result[0]


@router.delete("/{email}")
async def delete_portal_user(email: str, _=Depends(require_admin)):
    db = get_db()
    result = await db.delete("portal_users", filters={"email": f"eq.{email}"})
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}
