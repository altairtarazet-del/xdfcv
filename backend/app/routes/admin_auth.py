from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import verify_password, create_token, require_admin
from app.database import get_db

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def admin_login(body: LoginRequest):
    db = get_db()
    rows = await db.select("admin_users", filters={"username": f"eq.{body.username}"})
    if not rows:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    row = rows[0]
    if not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(sub=row["username"], role="admin")
    return {"token": token, "username": row["username"]}


@router.get("/me")
async def admin_me(payload: dict = Depends(require_admin)):
    return {"username": payload["sub"], "role": "admin"}
