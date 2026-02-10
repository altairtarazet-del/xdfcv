from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_admin, hash_password
from app.database import get_db

router = APIRouter()


@router.get("/")
async def list_portal_users(_=Depends(require_admin)):
    db = get_db()
    rows = await db.select(
        "portal_users",
        columns="id,email,display_name,last_login_at,created_at",
        order="created_at.desc",
    )
    return {"users": rows}


class CreatePortalUser(BaseModel):
    email: str
    password: str
    display_name: str | None = None


@router.post("/")
async def create_portal_user(body: CreatePortalUser, _=Depends(require_admin)):
    db = get_db()
    try:
        rows = await db.insert("portal_users", {
            "email": body.email,
            "password_hash": hash_password(body.password),
            "display_name": body.display_name,
        })
        return rows[0]
    except Exception:
        raise HTTPException(status_code=409, detail="Email already exists")


@router.delete("/{email}")
async def delete_portal_user(email: str, _=Depends(require_admin)):
    db = get_db()
    result = await db.delete("portal_users", filters={"email": f"eq.{email}"})
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}
