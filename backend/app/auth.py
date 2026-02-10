import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

security = HTTPBearer()

# Role hierarchy: super_admin > admin > viewer
ROLE_HIERARCHY = {"super_admin": 3, "admin": 2, "viewer": 1}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(sub: str, role: Literal["admin", "portal"], extra: dict | None = None) -> str:
    if role == "admin":
        exp = datetime.now(timezone.utc) + timedelta(days=settings.admin_jwt_expire_days)
    else:
        exp = datetime.now(timezone.utc) + timedelta(hours=settings.portal_jwt_expire_hours)
    payload = {"sub": sub, "role": role, "exp": exp}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token() -> tuple[str, str]:
    """Generate a refresh token and its hash. Returns (raw_token, token_hash)."""
    raw = secrets.token_urlsafe(64)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, token_hash


def verify_refresh_token(raw_token: str, stored_hash: str) -> bool:
    return hashlib.sha256(raw_token.encode()).hexdigest() == stored_hash


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def require_admin(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    payload = decode_token(creds.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return payload


async def require_portal(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    payload = decode_token(creds.credentials)
    if payload.get("role") != "portal":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Portal access required")
    return payload


def require_role(min_role: str):
    """Dependency factory: require minimum role level."""
    min_level = ROLE_HIERARCHY.get(min_role, 0)

    async def dependency(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
        payload = decode_token(creds.credentials)
        if payload.get("role") != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
        user_role = payload.get("admin_role", "viewer")
        if ROLE_HIERARCHY.get(user_role, 0) < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {min_role} role or higher",
            )
        return payload

    return dependency
