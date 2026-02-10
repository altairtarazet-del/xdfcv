"""
Supabase database access via PostgREST API + service role key.
Uses httpx for async HTTP calls instead of direct PostgreSQL connection.
"""
import json
from typing import Any

import httpx

from app.config import settings

_client: httpx.AsyncClient | None = None


async def init_db():
    global _client
    _client = httpx.AsyncClient(
        base_url=f"{settings.supabase_url}/rest/v1",
        headers={
            "apikey": settings.supabase_service_key,
            "Authorization": f"Bearer {settings.supabase_service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        timeout=30,
    )


async def close_db():
    global _client
    if _client:
        await _client.aclose()
        _client = None


def get_client() -> httpx.AsyncClient:
    assert _client is not None, "Database client not initialized"
    return _client


class DB:
    """Database helper providing a simpler interface over PostgREST."""

    def __init__(self):
        self.client = get_client()

    # --- Generic helpers ---

    async def select(
        self,
        table: str,
        columns: str = "*",
        filters: dict[str, Any] | None = None,
        order: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
        single: bool = False,
    ) -> list[dict] | dict | None:
        params: dict[str, str] = {"select": columns}
        if filters:
            for key, val in filters.items():
                params[key] = val
        if order:
            params["order"] = order
        if limit:
            params["limit"] = str(limit)
        if offset:
            params["offset"] = str(offset)

        headers = {}
        if single:
            headers["Accept"] = "application/vnd.pgrst.object+json"

        resp = await self.client.get(f"/{table}", params=params, headers=headers)
        if resp.status_code == 406 and single:
            return None
        resp.raise_for_status()
        return resp.json()

    async def insert(self, table: str, data: dict | list[dict], on_conflict: str | None = None) -> list[dict]:
        headers = {}
        if on_conflict:
            headers["Prefer"] = f"return=representation,resolution=merge-duplicates"
            headers["on-conflict"] = on_conflict
        resp = await self.client.post(f"/{table}", json=data if isinstance(data, list) else [data], headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def update(self, table: str, data: dict, filters: dict[str, str]) -> list[dict]:
        params = {}
        for key, val in filters.items():
            params[key] = val
        resp = await self.client.patch(f"/{table}", json=data, params=params)
        resp.raise_for_status()
        return resp.json()

    async def delete(self, table: str, filters: dict[str, str]) -> list[dict]:
        resp = await self.client.delete(f"/{table}", params=filters)
        resp.raise_for_status()
        return resp.json()

    async def rpc(self, function_name: str, params: dict | None = None) -> Any:
        resp = await self.client.post(f"/rpc/{function_name}", json=params or {})
        resp.raise_for_status()
        return resp.json()

    async def count(self, table: str, filters: dict[str, str] | None = None) -> int:
        params: dict[str, str] = {"select": "count"}
        if filters:
            params.update(filters)
        headers = {"Prefer": "count=exact"}
        resp = await self.client.head(f"/{table}", params=params, headers=headers)
        resp.raise_for_status()
        content_range = resp.headers.get("content-range", "*/0")
        total = content_range.split("/")[-1]
        return int(total) if total != "*" else 0


def get_db() -> DB:
    return DB()
