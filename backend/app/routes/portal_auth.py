from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import verify_password, create_token, require_portal
from app.database import get_pool

router = APIRouter()


class PortalLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def portal_login(body: PortalLoginRequest):
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, email, password_hash, display_name FROM portal_users WHERE email = $1",
        body.email,
    )
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    await pool.execute(
        "UPDATE portal_users SET last_login_at = NOW() WHERE id = $1", row["id"]
    )
    token = create_token(sub=row["email"], role="portal", extra={"display_name": row["display_name"]})
    return {"token": token, "email": row["email"], "display_name": row["display_name"]}


@router.get("/me")
async def portal_me(payload: dict = Depends(require_portal)):
    return {"email": payload["sub"], "role": "portal", "display_name": payload.get("display_name")}
