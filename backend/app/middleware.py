"""Audit log middleware and rate limiting middleware."""
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt, JWTError

from app.config import settings
from app.database import get_db
from app.rate_limit import api_limiter

# Methods that mutate state
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Paths to skip audit logging (login paths are now included for security auditing)
SKIP_AUDIT_PATHS = {"/api/health"}


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        path = request.url.path

        # Log login attempts (both success and failure)
        if path in ("/api/admin/login", "/api/portal/login") and request.method == "POST":
            try:
                await self._log_login_attempt(request, response.status_code)
            except Exception:
                pass

        # Only log mutating requests that succeeded
        if (
            request.method in MUTATING_METHODS
            and response.status_code < 400
            and path not in SKIP_AUDIT_PATHS
        ):
            try:
                await self._log_action(request)
            except Exception:
                pass  # Audit logging should never break the request

        return response

    async def _log_login_attempt(self, request: Request, status_code: int):
        ip = request.client.host if request.client else None
        path = request.url.path
        success = status_code < 400
        db = get_db()
        await db.insert("audit_logs", {
            "action": f"login_{'success' if success else 'failure'}",
            "entity_type": "auth",
            "ip_address": ip,
            "details": {"path": path, "status_code": status_code},
        })

    async def _log_action(self, request: Request):
        admin_username = None
        admin_id = None

        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                payload = jwt.decode(
                    auth_header[7:],
                    settings.jwt_secret,
                    algorithms=[settings.jwt_algorithm],
                )
                if payload.get("role") == "admin":
                    admin_username = payload.get("sub")
                    admin_id = payload.get("admin_id")
            except JWTError:
                pass

        if not admin_username:
            return

        # Determine action from method + path
        path = request.url.path
        action = f"{request.method} {path}"

        # Determine entity type from path
        entity_type = "unknown"
        if "/accounts" in path:
            entity_type = "account"
        elif "/portal-users" in path:
            entity_type = "portal_user"
        elif "/scan" in path:
            entity_type = "scan"
        elif "/admin" in path:
            entity_type = "admin"
        elif "/alerts" in path:
            entity_type = "alert"

        db = get_db()
        await db.insert("audit_logs", {
            "admin_username": admin_username,
            "admin_id": admin_id,
            "action": action,
            "entity_type": entity_type,
            "ip_address": request.client.host if request.client else None,
        })


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"

        if not api_limiter.is_allowed(client_ip):
            return Response(
                content='{"detail":"Rate limit exceeded"}',
                status_code=429,
                media_type="application/json",
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(api_limiter.remaining(client_ip))
        return response
