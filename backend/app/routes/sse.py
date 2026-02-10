"""SSE endpoints for real-time notifications."""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.auth import require_admin, require_portal
from app.services.sse_bridge import sse_manager, event_generator

router = APIRouter()


@router.get("/admin/events")
async def admin_sse(request: Request, payload: dict = Depends(require_admin)):
    """SSE stream for admin dashboard — all events."""
    queue = sse_manager.subscribe_admin()

    async def generate():
        try:
            async for event in event_generator(queue):
                if await request.is_disconnected():
                    break
                yield event
        finally:
            sse_manager.unsubscribe_admin(queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/portal/events")
async def portal_sse(request: Request, payload: dict = Depends(require_portal)):
    """SSE stream for portal — scoped to user's account."""
    email = payload["sub"]
    queue = sse_manager.subscribe_portal(email)

    async def generate():
        try:
            async for event in event_generator(queue):
                if await request.is_disconnected():
                    break
                yield event
        finally:
            sse_manager.unsubscribe_portal(email, queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
