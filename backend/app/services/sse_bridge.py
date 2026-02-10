"""
SSE (Server-Sent Events) bridge for real-time notifications.
Backend proxy: collects events and fans them out to connected clients.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


class SSEManager:
    """Manages SSE connections and event broadcasting."""

    def __init__(self):
        # admin connections: set of asyncio.Queue
        self._admin_queues: set[asyncio.Queue] = set()
        # portal connections: email -> set of asyncio.Queue
        self._portal_queues: dict[str, set[asyncio.Queue]] = {}

    def subscribe_admin(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._admin_queues.add(queue)
        return queue

    def unsubscribe_admin(self, queue: asyncio.Queue):
        self._admin_queues.discard(queue)

    def subscribe_portal(self, email: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=50)
        if email not in self._portal_queues:
            self._portal_queues[email] = set()
        self._portal_queues[email].add(queue)
        return queue

    def unsubscribe_portal(self, email: str, queue: asyncio.Queue):
        if email in self._portal_queues:
            self._portal_queues[email].discard(queue)
            if not self._portal_queues[email]:
                del self._portal_queues[email]

    async def broadcast_admin(self, event_type: str, data: dict):
        """Send event to all connected admin clients."""
        event = {"type": event_type, "data": data, "timestamp": datetime.now(timezone.utc).isoformat()}
        dead_queues = []
        for queue in self._admin_queues:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                dead_queues.append(queue)
        for q in dead_queues:
            self._admin_queues.discard(q)

    async def broadcast_portal(self, email: str, event_type: str, data: dict):
        """Send event to all connected portal clients for a specific email."""
        event = {"type": event_type, "data": data, "timestamp": datetime.now(timezone.utc).isoformat()}
        if email not in self._portal_queues:
            return
        dead_queues = []
        for queue in self._portal_queues[email]:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                dead_queues.append(queue)
        for q in dead_queues:
            self._portal_queues[email].discard(q)

    async def notify_new_email(self, account_email: str, message: dict):
        """Notify about a new email received."""
        data = {
            "email": account_email,
            "subject": message.get("subject", ""),
            "from": message.get("from", message.get("sender", "")),
        }
        await self.broadcast_admin("new_email", data)
        await self.broadcast_portal(account_email, "new_email", data)

    async def notify_stage_change(self, account_email: str, old_stage: str, new_stage: str):
        """Notify about a stage change."""
        data = {
            "email": account_email,
            "old_stage": old_stage,
            "new_stage": new_stage,
        }
        await self.broadcast_admin("stage_change", data)
        await self.broadcast_portal(account_email, "stage_change", data)

    async def notify_alert(self, alert: dict):
        """Notify about a new alert."""
        await self.broadcast_admin("alert", alert)

    @property
    def admin_count(self) -> int:
        return len(self._admin_queues)

    @property
    def portal_count(self) -> int:
        return sum(len(qs) for qs in self._portal_queues.values())


# Singleton
sse_manager = SSEManager()


async def event_generator(queue: asyncio.Queue) -> AsyncGenerator[str, None]:
    """Generate SSE events from a queue."""
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
                yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"
            except asyncio.TimeoutError:
                # Send keepalive
                yield ": keepalive\n\n"
    except asyncio.CancelledError:
        pass
