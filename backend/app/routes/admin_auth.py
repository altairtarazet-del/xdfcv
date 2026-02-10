from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import verify_password, create_token, require_admin
from app.database import get_pool

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def admin_login(body: LoginRequest):
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, username, password_hash FROM admin_users WHERE username = $1",
        body.username,
    )
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(sub=row["username"], role="admin")
    return {"token": token, "username": row["username"]}


@router.get("/me")
async def admin_me(payload: dict = Depends(require_admin)):
    return {"username": payload["sub"], "role": "admin"}
