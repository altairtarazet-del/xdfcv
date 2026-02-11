"""Template fingerprinting for email deduplication."""
import hashlib
import re

# Subject'teki hesap-spesifik verileri temizle
_AMOUNT_RE = re.compile(r"\$[\d,.]+")
_DATE_RE = re.compile(r"\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b")
_NAME_RE = re.compile(r"\b(Hi|Hello|Hey|Dear)\s+[A-Z][a-z]+")
_NUM_RE = re.compile(r"\b\d{4,}\b")  # tracking numbers, IDs


def normalize_subject(subject: str) -> str:
    """Subject'i template'e indirge - kisiye ozel verileri strip et."""
    s = subject.strip().lower()
    s = _AMOUNT_RE.sub("$X", s)
    s = _DATE_RE.sub("DATE", s)
    s = _NAME_RE.sub("GREETING", s)
    s = _NUM_RE.sub("NUM", s)
    return s


def sender_domain(sender: str) -> str:
    """Sender string'den domain cikar."""
    if "<" in sender:
        sender = sender.split("<")[-1].rstrip(">")
    if "@" in sender:
        return sender.split("@")[-1].lower()
    return sender.lower()


def make_fingerprint(subject: str, sender: str) -> str:
    """Subject + sender_domain → SHA256 fingerprint."""
    norm = normalize_subject(subject)
    domain = sender_domain(sender)
    raw = f"{domain}|{norm}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


class TemplateCache:
    """Scan-level template cache. Scan boyunca yasayan in-memory cache."""

    def __init__(self):
        self._cache: dict[str, dict] = {}  # fingerprint → classification dict

    def get(self, fingerprint: str) -> dict | None:
        return self._cache.get(fingerprint)

    def put(self, fingerprint: str, classification: dict) -> None:
        self._cache[fingerprint] = classification

    @property
    def stats(self) -> dict:
        return {"templates_cached": len(self._cache)}
