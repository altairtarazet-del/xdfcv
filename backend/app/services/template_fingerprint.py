"""Template fingerprinting for email deduplication."""
import hashlib
import re

# Subject'teki hesap-spesifik verileri temizle
_AMOUNT_RE = re.compile(r"\$[\d,.]+")
# Expanded date patterns: MM/DD/YYYY, DD/MM/YYYY, MM-DD-YYYY, YYYY-MM-DD
_DATE_SLASH_RE = re.compile(r"\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b")
# "Jan 13", "Feb 5" etc.
_DATE_MON_DAY_RE = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b", re.IGNORECASE
)
# "January 13, 2025", "February 5 2024" etc.
_DATE_MONTH_FULL_RE = re.compile(
    r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)"
    r"\s+\d{1,2}(?:,?\s+\d{4})?\b",
    re.IGNORECASE,
)
# ISO format: 2025-01-13
_DATE_ISO_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
# Year-only: 2000-2099, 1900-1999
_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")
# Name greeting — minimum 3 characters for name to reduce false positives
_NAME_RE = re.compile(r"\b(Hi|Hello|Hey|Dear)\s+[A-Z][a-z]{2,}")
_NUM_RE = re.compile(r"\b\d{4,}\b")  # tracking numbers, IDs


def normalize_subject(subject: str) -> str:
    """Subject'i template'e indirge - kisiye ozel verileri strip et."""
    s = subject.strip().lower()
    s = _AMOUNT_RE.sub("$X", s)
    # Apply date patterns from most specific to least specific
    s = _DATE_MONTH_FULL_RE.sub("DATE", s)
    s = _DATE_MON_DAY_RE.sub("DATE", s)
    s = _DATE_ISO_RE.sub("DATE", s)
    s = _DATE_SLASH_RE.sub("DATE", s)
    s = _YEAR_RE.sub("YEAR", s)
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
        self._hits = 0
        self._misses = 0

    def get(self, fingerprint: str) -> dict | None:
        result = self._cache.get(fingerprint)
        if result is not None:
            self._hits += 1
        else:
            self._misses += 1
        return result

    def put(self, fingerprint: str, classification: dict) -> None:
        self._cache[fingerprint] = classification

    @property
    def stats(self) -> dict:
        return {
            "templates_cached": len(self._cache),
            "hits": self._hits,
            "misses": self._misses,
            "total": self._hits + self._misses,
        }

    def get_cache_stats(self) -> dict:
        """Return hit/miss/total counters and cache size."""
        return self.stats
