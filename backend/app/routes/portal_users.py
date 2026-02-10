from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_admin, hash_password
from app.database import get_pool

router = APIRouter()


@router.get("/")
async def list_portal_users(_=Depends(require_admin)):
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT id, email, display_name, last_login_at, created_at FROM portal_users ORDER BY created_at DESC"
    )
    return {"users": [dict(r) for r in rows]}


class CreatePortalUser(BaseModel):
    email: str
    password: str
    display_name: str | None = None


@router.post("/")
async def create_portal_user(body: CreatePortalUser, _=Depends(require_admin)):
    pool = get_pool()
    try:
        row = await pool.fetchrow(
            """INSERT INTO portal_users (email, password_hash, display_name)
               VALUES ($1, $2, $3) RETURNING id, email, display_name, created_at""",
            body.email, hash_password(body.password), body.display_name,
        )
    except Exception:
        raise HTTPException(status_code=409, detail="Email already exists")
    return dict(row)


@router.delete("/{email}")
async def delete_portal_user(email: str, _=Depends(require_admin)):
    pool = get_pool()
    result = await pool.execute("DELETE FROM portal_users WHERE email = $1", email)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}
