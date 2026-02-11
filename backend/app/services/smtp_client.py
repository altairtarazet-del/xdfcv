import asyncio
import time
import httpx

from app.config import settings

BASE_URL = "https://api.smtp.dev"
MAX_RETRIES = 3
RETRY_BACKOFF = [2, 5, 15]  # seconds
CACHE_TTL = 60  # seconds


class _Cache:
    """Simple in-memory TTL cache."""

    def __init__(self, ttl: int = CACHE_TTL):
        self.ttl = ttl
        self._store: dict[str, tuple[float, object]] = {}

    def get(self, key: str):
        if key in self._store:
            ts, val = self._store[key]
            if time.time() - ts < self.ttl:
                return val
            del self._store[key]
        return None

    def set(self, key: str, value: object):
        self._store[key] = (time.time(), value)

    def invalidate(self, key: str):
        self._store.pop(key, None)

    def clear(self):
        self._store.clear()


# Singleton HTTP client for connection pooling
_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=30,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _http_client


class SmtpDevClient:
    _cache = _Cache()

    def __init__(self):
        self.api_key = settings.smtp_dev_api_key

    def _headers(self) -> dict:
        return {
            "X-API-Key": self.api_key,
            "Accept": "application/ld+json",
        }

    async def _request(self, method: str, path: str, **kwargs) -> dict | list | None:
        """Make an HTTP request with retry on 429 and connection pooling."""
        client = _get_http_client()
        for attempt in range(MAX_RETRIES):
            resp = await client.request(method, f"{BASE_URL}{path}", headers=self._headers(), **kwargs)
            if resp.status_code == 429:
                wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
                await asyncio.sleep(wait)
                continue
            resp.raise_for_status()
            if resp.status_code == 204:
                return None
            return resp.json()
        raise Exception(f"SMTP.dev API rate limited after {MAX_RETRIES} retries: {path}")

    async def get_all_accounts(self) -> list[dict]:
        """Fetch all SMTP.dev accounts (paginated JSON-LD) with caching."""
        cached = self._cache.get("all_accounts")
        if cached is not None:
            return cached

        all_accounts = []
        page = 1
        while True:
            data = await self._request("GET", "/accounts", params={"page": page, "per_page": 100})
            members = data.get("member", []) if isinstance(data, dict) else data
            for acc in members:
                # Normalize: add 'email' from 'address', extract mailbox IDs
                acc["email"] = acc.get("address", "")
                mailboxes = acc.get("mailboxes", [])
                for mb in mailboxes:
                    path_lower = mb.get("path", "").lower()
                    if path_lower == "inbox":
                        acc["inbox_id"] = mb["id"]
                    elif path_lower == "trash":
                        acc["trash_id"] = mb["id"]
                    elif path_lower == "junk":
                        acc["junk_id"] = mb["id"]
                    elif path_lower == "sent":
                        acc["sent_id"] = mb["id"]
            all_accounts.extend(members)
            # Check for next page
            view = data.get("view", {}) if isinstance(data, dict) else {}
            if not view.get("next") or len(members) == 0:
                break
            page += 1

        self._cache.set("all_accounts", all_accounts)
        return all_accounts

    async def create_account(self, email: str, password: str | None = None) -> dict:
        """Create a new SMTP.dev account."""
        payload = {"address": email}
        if password:
            payload["password"] = password
        data = await self._request("POST", "/accounts", json=payload)
        if data:
            data["email"] = data.get("address", email)
        # Invalidate accounts cache
        self._cache.invalidate("all_accounts")
        return data

    async def update_password(self, account_id: str, password: str) -> bool:
        """Update SMTP.dev account password."""
        client = _get_http_client()
        resp = await client.patch(
            f"{BASE_URL}/accounts/{account_id}",
            headers={**self._headers(), "Content-Type": "application/merge-patch+json"},
            json={"password": password},
        )
        return resp.status_code < 300

    async def find_account_by_email(self, email: str) -> dict | None:
        """Find an SMTP.dev account by email address."""
        cached = self._cache.get(f"account:{email}")
        if cached is not None:
            return cached

        accounts = await self.get_all_accounts()
        for acc in accounts:
            if acc.get("address") == email or acc.get("email") == email:
                self._cache.set(f"account:{email}", acc)
                return acc
        return None

    async def get_mailboxes(self, account_id: str) -> list[dict]:
        """Get mailboxes for an account (JSON-LD collection)."""
        cached = self._cache.get(f"mailboxes:{account_id}")
        if cached is not None:
            return cached

        data = await self._request("GET", f"/accounts/{account_id}/mailboxes")
        members = data.get("member", []) if isinstance(data, dict) else data
        for mb in members:
            mb["name"] = mb.get("path", mb.get("name", ""))

        self._cache.set(f"mailboxes:{account_id}", members)
        return members

    async def get_messages(
        self, account_id: str, mailbox_id: str, page: int = 1, per_page: int = 50
    ) -> dict:
        """Get messages in a mailbox (paginated JSON-LD)."""
        data = await self._request(
            "GET",
            f"/accounts/{account_id}/mailboxes/{mailbox_id}/messages",
            params={"page": page, "per_page": per_page},
        )
        if isinstance(data, dict):
            for msg in data.get("member", []):
                _normalize_message(msg)
            return {"data": data.get("member", []), "total": data.get("totalItems", 0)}
        return {"data": data, "total": len(data)}

    async def get_message(self, message_id: str, account_id: str = None, mailbox_id: str = None) -> dict | None:
        """Get a single message with full body."""
        if message_id.startswith("/"):
            path = message_id
        elif account_id and mailbox_id:
            path = f"/accounts/{account_id}/mailboxes/{mailbox_id}/messages/{message_id}"
        else:
            return None
        data = await self._request("GET", path)
        if data:
            _normalize_message(data)
        return data

    async def get_attachment(self, account_id: str, mailbox_id: str, message_id: str, attachment_id: str) -> tuple[bytes, str, str]:
        """Download an attachment and return (content_bytes, content_type, filename)."""
        path = f"/accounts/{account_id}/mailboxes/{mailbox_id}/messages/{message_id}/attachment/{attachment_id}"
        client = _get_http_client()
        for attempt in range(MAX_RETRIES):
            resp = await client.get(f"{BASE_URL}{path}", headers=self._headers())
            if resp.status_code == 429:
                wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
                await asyncio.sleep(wait)
                continue
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "application/octet-stream")
            # Try to extract filename from content-disposition header
            cd = resp.headers.get("content-disposition", "")
            filename = "attachment"
            if "filename=" in cd:
                filename = cd.split("filename=")[-1].strip('" ')
            return resp.content, content_type, filename
        raise Exception(f"SMTP.dev API rate limited after {MAX_RETRIES} retries: {path}")

    async def get_all_messages_headers(self, account_id: str, mailbox_ids: list[str]) -> list[dict]:
        """Fetch message headers from multiple mailboxes."""
        all_messages = []
        for mb_id in mailbox_ids:
            page = 1
            while True:
                data = await self._request(
                    "GET",
                    f"/accounts/{account_id}/mailboxes/{mb_id}/messages",
                    params={"page": page, "per_page": 100},
                )
                members = data.get("member", []) if isinstance(data, dict) else data
                if not members:
                    break
                for msg in members:
                    _normalize_message(msg)
                all_messages.extend(members)
                if len(members) < 100:
                    break
                page += 1
        return all_messages


def _normalize_message(msg: dict):
    """Normalize SMTP.dev message format."""
    # from: object {address, name} -> string
    from_field = msg.get("from")
    if isinstance(from_field, dict):
        addr = from_field.get("address", "")
        name = from_field.get("name", "")
        msg["from"] = f"{name} <{addr}>" if name else addr
        msg["sender"] = addr
    # html/text: may be arrays, join into strings
    if isinstance(msg.get("html"), list):
        msg["html"] = "\n".join(msg["html"])
    if isinstance(msg.get("text"), list):
        msg["text"] = "\n".join(msg["text"])
