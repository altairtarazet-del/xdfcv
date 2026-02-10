from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import verify_password, create_token, require_portal
from app.database import get_db

router = APIRouter()


class PortalLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def portal_login(body: PortalLoginRequest):
    db = get_db()
    rows = await db.select("portal_users", filters={"email": f"eq.{body.email}"})
    if not rows:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    row = rows[0]
    if not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    await db.update(
        "portal_users",
        {"last_login_at": datetime.now(timezone.utc).isoformat()},
        filters={"id": f"eq.{row['id']}"},
    )
    token = create_token(sub=row["email"], role="portal", extra={"display_name": row.get("display_name")})
    return {"token": token, "email": row["email"], "display_name": row.get("display_name")}


@router.get("/me")
async def portal_me(payload: dict = Depends(require_portal)):
    return {"email": payload["sub"], "role": "portal", "display_name": payload.get("display_name")}
