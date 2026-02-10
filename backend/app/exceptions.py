"""Custom exception classes and global error handler."""
import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base application error."""
    def __init__(self, message: str, status_code: int = 500, detail: str | None = None):
        self.message = message
        self.status_code = status_code
        self.detail = detail or message
        super().__init__(self.message)


class NotFoundError(AppError):
    def __init__(self, entity: str, identifier: str = ""):
        msg = f"{entity} not found" + (f": {identifier}" if identifier else "")
        super().__init__(msg, status_code=404)


class ConflictError(AppError):
    def __init__(self, message: str = "Resource already exists"):
        super().__init__(message, status_code=409)


class ValidationError(AppError):
    def __init__(self, message: str):
        super().__init__(message, status_code=400)


class RateLimitError(AppError):
    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(message, status_code=429)


def setup_exception_handlers(app: FastAPI):
    """Register global exception handlers."""

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        request_id = request.state.request_id if hasattr(request.state, "request_id") else None
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.message,
                "detail": exc.detail,
                "request_id": request_id,
            },
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception):
        request_id = request.state.request_id if hasattr(request.state, "request_id") else str(uuid.uuid4())[:8]
        logger.error("Unhandled error [%s]: %s", request_id, exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "detail": "An unexpected error occurred",
                "request_id": request_id,
            },
        )


class RequestIdMiddleware:
    """Middleware to add request ID to every request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # Generate request ID
            request_id = str(uuid.uuid4())[:8]

            async def send_with_request_id(message):
                if message["type"] == "http.response.start":
                    headers = list(message.get("headers", []))
                    headers.append([b"x-request-id", request_id.encode()])
                    message["headers"] = headers
                await send(message)

            # Store request ID in scope for later access
            scope.setdefault("state", {})["request_id"] = request_id
            await self.app(scope, receive, send_with_request_id)
        else:
            await self.app(scope, receive, send)
