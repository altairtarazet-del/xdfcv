"""
7-Stage Account Detection (Enhanced)

Priority (highest wins):
  DEACTIVATED > ACTIVE > BGC_CONSIDER > BGC_CLEAR > BGC_PENDING > IDENTITY_VERIFIED > REGISTERED

Detection signals (from email subjects/senders):
  1. REGISTERED         - Account exists in SMTP.dev but no DoorDash email found
  2. IDENTITY_VERIFIED  - Checkr "identity/information verified" email
  3. BGC_PENDING        - BGC vendor submitted/processing emails
  4. BGC_CLEAR          - "background check is complete" + no adverse patterns in body
  5. BGC_CONSIDER       - "background check is complete" + adverse action patterns in body
  6. ACTIVE             - Earnings/delivery/payment emails from DoorDash
  7. DEACTIVATED        - Account deactivation / suspension emails

Enhancements:
  - Compiled regex patterns for variant spelling and whitespace tolerance
  - Multi-vendor BGC support (Checkr, Onfido, Sterling, Accurate, Certn)
  - Reactivation support (DEACTIVATED -> ACTIVE transition)
  - Confidence scoring per detected stage (high/medium/low)
  - Email date sorting (newest first) for accurate detection
  - Specific adverse-action patterns instead of broad "consider" keyword
"""

import re
from datetime import datetime

# Priority: higher number = higher priority stage
STAGE_PRIORITY = {
    "REGISTERED": 0,
    "IDENTITY_VERIFIED": 1,
    "BGC_PENDING": 2,
    "BGC_CLEAR": 3,
    "BGC_CONSIDER": 4,
    "ACTIVE": 5,
    "DEACTIVATED": 6,
}

# --- Multi-vendor BGC support ---
BGC_VENDORS = {"checkr", "onfido", "sterling", "accurate", "certn"}

# --- Compiled regex patterns ---

# Deactivation patterns (subject or body)
_DEACTIVATION_PATTERNS = [
    re.compile(r"dasher\s+account\s+has\s+been\s+deactivated", re.IGNORECASE),
    re.compile(r"account.*deactivat", re.IGNORECASE),
    re.compile(r"deactivation.*confirm", re.IGNORECASE),
    re.compile(r"your\s+account\s+is.*deactivat", re.IGNORECASE),
    re.compile(r"account.*suspend", re.IGNORECASE),
    re.compile(r"permanently.*deactivat", re.IGNORECASE),
]

# Reactivation patterns (allows DEACTIVATED -> ACTIVE)
_REACTIVATION_PATTERNS = [
    re.compile(r"account.*reactivat", re.IGNORECASE),
    re.compile(r"welcome\s+back", re.IGNORECASE),
    re.compile(r"reactivation.*complete", re.IGNORECASE),
    re.compile(r"account.*restored", re.IGNORECASE),
]

# Active signal patterns — real earnings/delivery/payment proof
# EXCLUDED (false positives): "how was your experience" (survey), "maximize your earnings"
# (promo), "dasher bank account" (setup), "new dash available" (promo), "time to dash" (promo)
_ACTIVE_PATTERNS = [
    re.compile(r"payment\s+processed", re.IGNORECASE),
    re.compile(r"pay\s+statement", re.IGNORECASE),
    re.compile(r"fast\s+pay\s+transfer", re.IGNORECASE),
    re.compile(r"dasher\s+welcome\s+gift", re.IGNORECASE),
    re.compile(r"your\s+first\s+dash", re.IGNORECASE),
    re.compile(r"first\s+dash.*(?:done|complete|finished)", re.IGNORECASE),
    re.compile(r"congratulations.*first\s+dash", re.IGNORECASE),
    re.compile(r"you\s+completed.*(?:first\s+)?dash", re.IGNORECASE),
]

# BGC complete pattern (whitespace-insensitive, "bgc" alias)
_BGC_COMPLETE_PATTERN = re.compile(
    r"(?:background\s+check|bgc)\s+is\s+complete", re.IGNORECASE
)

# BGC pending patterns (whitespace-insensitive, "bgc" alias)
_BGC_PENDING_PATTERNS = [
    re.compile(r"(?:background\s+check|bgc)\s+is\s+taking\s+longer", re.IGNORECASE),
    re.compile(r"(?:background\s+check|bgc)\s+paused", re.IGNORECASE),
    re.compile(r"more\s+information\s+needed", re.IGNORECASE),
    re.compile(r"let'?s\s+find\s+your\s+(?:background\s+check|bgc)", re.IGNORECASE),
    re.compile(r"agreed\s+to\s+checkr", re.IGNORECASE),
    re.compile(r"verify\s+your\s+email", re.IGNORECASE),
    re.compile(r"finish\s+your\s+personal\s+check", re.IGNORECASE),
]

# Generic "background check" / "bgc" but not "complete" — for pending fallback
_BGC_GENERIC_PATTERN = re.compile(r"(?:background\s+check|bgc)", re.IGNORECASE)
_COMPLETE_PATTERN = re.compile(r"complete", re.IGNORECASE)

# Identity verified patterns
_IDENTITY_VERIFIED_PATTERNS = [
    re.compile(r"identity.*verified", re.IGNORECASE),
    re.compile(r"information\s+verified", re.IGNORECASE),
]

# BGC body patterns: specific adverse-action phrases (replaces broad "consider")
_BGC_CONSIDER_BODY_PATTERNS = [
    re.compile(r"could\s+potentially\s+impact", re.IGNORECASE),
    re.compile(r"disqualif", re.IGNORECASE),
    re.compile(r"may\s+affect\s+eligibility", re.IGNORECASE),
    re.compile(r"adverse.*action", re.IGNORECASE),
    re.compile(r"require.*review", re.IGNORECASE),
]

# --- Confidence levels ---
# high   = exact/specific pattern match
# medium = regex variant match
# low    = generic/fallback match

_HIGH_CONFIDENCE_DEACTIVATION = _DEACTIVATION_PATTERNS[0]  # exact phrase
_HIGH_CONFIDENCE_ACTIVE = [_ACTIVE_PATTERNS[0], _ACTIVE_PATTERNS[1]]  # payment processed/pay statement


def _lower(s: str | None) -> str:
    return (s or "").lower().strip()


def _any_match(patterns: list[re.Pattern], text: str) -> bool:
    """Return True if any compiled pattern matches the text."""
    return any(p.search(text) for p in patterns)


def _is_bgc_vendor(sender: str) -> bool:
    """Check if sender is from a known BGC vendor."""
    sender_lower = sender.lower()
    return any(vendor in sender_lower for vendor in BGC_VENDORS)


def _sort_messages_by_date(messages: list[dict]) -> list[dict]:
    """Sort messages by date descending (newest first).

    Handles missing or unparseable dates by placing them last.
    """
    def _parse_date(msg):
        raw = msg.get("date") or msg.get("created_at") or ""
        if not raw:
            return datetime.min
        if isinstance(raw, datetime):
            return raw
        for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(raw.replace("Z", "+00:00").rstrip("+00:00") if "Z" in raw else raw, fmt)
            except (ValueError, TypeError):
                continue
        return datetime.min

    return sorted(messages, key=_parse_date, reverse=True)


def _compute_confidence(stage: str, subject: str, sender: str) -> str:
    """Compute confidence level for a detected stage.

    Returns 'high', 'medium', or 'low' based on pattern specificity.
    """
    if stage == "DEACTIVATED":
        if _HIGH_CONFIDENCE_DEACTIVATION.search(subject):
            return "high"
        return "medium"

    if stage == "ACTIVE":
        if any(p.search(subject) for p in _HIGH_CONFIDENCE_ACTIVE):
            return "high"
        if _any_match(_REACTIVATION_PATTERNS, subject):
            return "medium"
        return "medium"

    if stage in ("BGC_CLEAR", "BGC_CONSIDER"):
        if _BGC_COMPLETE_PATTERN.search(subject):
            return "high"
        return "medium"

    if stage == "BGC_PENDING":
        if _any_match(_BGC_PENDING_PATTERNS, subject):
            return "high"
        if _BGC_GENERIC_PATTERN.search(subject):
            return "low"
        return "medium"

    if stage == "IDENTITY_VERIFIED":
        if _any_match(_IDENTITY_VERIFIED_PATTERNS, subject):
            return "high"
        return "medium"

    return "low"


def detect_stage_from_messages(messages: list[dict], get_body_fn=None) -> tuple[str, str | None, str | None, list]:
    """Analyze email messages to detect the account stage.

    Messages are sorted by date (newest first) for accurate detection.
    The FSM uses priority-based stage promotion: higher-priority stages
    always override lower ones.

    Args:
        messages: List of message dicts with at least 'subject', 'from'/'sender' fields.
        get_body_fn: Not used in sync detection. Body check is handled separately.

    Returns:
        (stage, trigger_subject, trigger_date, needs_body_check) tuple.
        The result dict on the stage also carries 'confidence' and 'reactivated'
        metadata accessible via detect_stage_with_metadata().
    """
    detected_stage = "REGISTERED"
    trigger_subject = None
    trigger_date = None
    needs_body_check = []
    reactivated = False
    confidence = "low"

    # Sort by date DESC (newest first) for accurate stage detection
    sorted_messages = _sort_messages_by_date(messages)

    for msg in sorted_messages:
        subject = _lower(msg.get("subject", ""))
        sender = _lower(msg.get("from", msg.get("sender", "")))
        msg_date = msg.get("date", msg.get("created_at"))

        # REACTIVATION check — takes precedence over deactivation
        if _any_match(_REACTIVATION_PATTERNS, subject):
            reactivated = True
            if STAGE_PRIORITY["ACTIVE"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "ACTIVE"
                trigger_subject = msg.get("subject")
                trigger_date = msg_date
                confidence = _compute_confidence("ACTIVE", subject, sender)

        # DEACTIVATED — highest priority (unless reactivated)
        elif _any_match(_DEACTIVATION_PATTERNS, subject):
            if not reactivated:
                confidence = _compute_confidence("DEACTIVATED", subject, sender)
                return "DEACTIVATED", msg.get("subject"), msg_date, []

        # ACTIVE — earnings/delivery/payment emails
        elif _is_active_signal(subject, sender):
            if STAGE_PRIORITY["ACTIVE"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "ACTIVE"
                trigger_subject = msg.get("subject")
                trigger_date = msg_date
                confidence = _compute_confidence("ACTIVE", subject, sender)

        # BGC COMPLETE — needs body to determine CLEAR vs CONSIDER
        elif _BGC_COMPLETE_PATTERN.search(subject):
            needs_body_check.append(msg)
            if STAGE_PRIORITY["BGC_CLEAR"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "BGC_CLEAR"
                trigger_subject = msg.get("subject")
                trigger_date = msg_date
                confidence = _compute_confidence("BGC_CLEAR", subject, sender)

        # BGC_PENDING — vendor processing
        elif _is_bgc_pending_signal(subject, sender):
            if STAGE_PRIORITY["BGC_PENDING"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "BGC_PENDING"
                trigger_subject = msg.get("subject")
                trigger_date = msg_date
                confidence = _compute_confidence("BGC_PENDING", subject, sender)

        # IDENTITY_VERIFIED — identity verification
        elif _is_identity_verified_signal(subject, sender):
            if STAGE_PRIORITY["IDENTITY_VERIFIED"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "IDENTITY_VERIFIED"
                trigger_subject = msg.get("subject")
                trigger_date = msg_date
                confidence = _compute_confidence("IDENTITY_VERIFIED", subject, sender)

    return detected_stage, trigger_subject, trigger_date, needs_body_check


def detect_stage_with_metadata(messages: list[dict], get_body_fn=None) -> dict:
    """Extended version that returns stage detection with confidence and metadata.

    Returns:
        dict with keys: stage, trigger_subject, trigger_date, needs_body_check,
        confidence, reactivated.
    """
    detected_stage = "REGISTERED"
    trigger_subject = None
    trigger_date = None
    needs_body_check = []
    reactivated = False
    confidence = "low"

    sorted_messages = _sort_messages_by_date(messages)

    for msg in sorted_messages:
        subject = _lower(msg.get("subject", ""))
        sender = _lower(msg.get("from", msg.get("sender", "")))
        msg_date = msg.get("date", msg.get("created_at"))

        if _any_match(_REACTIVATION_PATTERNS, subject):
            reactivated = True
            if STAGE_PRIORITY["ACTIVE"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "ACTIVE"
                trigger_subject = msg.get("subject")
                trigger_date = msg_date
                confidence = _compute_confidence("ACTIVE", subject, sender)

        elif _any_match(_DEACTIVATION_PATTERNS, subject):
            if not reactivated:
                confidence = _compute_confidence("DEACTIVATED", subject, sender)
                return {
                    "stage": "DEACTIVATED",
                    "trigger_subject": msg.get("subject"),
                    "trigger_date": msg_date,
                    "needs_body_check": [],
                    "confidence": confidence,
                    "reactivated": False,
                }

        elif _is_active_signal(subject, sender):
            if STAGE_PRIORITY["ACTIVE"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "ACTIVE"
                trigger_subject = msg.get("subject")
                trigger_date = msg_date
                confidence = _compute_confidence("ACTIVE", subject, sender)

        elif _BGC_COMPLETE_PATTERN.search(subject):
            needs_body_check.append(msg)
            if STAGE_PRIORITY["BGC_CLEAR"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "BGC_CLEAR"
                trigger_subject = msg.get("subject")
                trigger_date = msg_date
                confidence = _compute_confidence("BGC_CLEAR", subject, sender)

        elif _is_bgc_pending_signal(subject, sender):
            if STAGE_PRIORITY["BGC_PENDING"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "BGC_PENDING"
                trigger_subject = msg.get("subject")
                trigger_date = msg_date
                confidence = _compute_confidence("BGC_PENDING", subject, sender)

        elif _is_identity_verified_signal(subject, sender):
            if STAGE_PRIORITY["IDENTITY_VERIFIED"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "IDENTITY_VERIFIED"
                trigger_subject = msg.get("subject")
                trigger_date = msg_date
                confidence = _compute_confidence("IDENTITY_VERIFIED", subject, sender)

    return {
        "stage": detected_stage,
        "trigger_subject": trigger_subject,
        "trigger_date": trigger_date,
        "needs_body_check": needs_body_check,
        "confidence": confidence,
        "reactivated": reactivated,
    }


def check_bgc_body(body_text: str) -> str:
    """Check BGC completion email body to determine CLEAR vs CONSIDER.

    Uses specific adverse-action patterns rather than broad keywords.
    Patterns: "could potentially impact", "disqualif*", "may affect eligibility",
    "adverse...action", "require...review".
    """
    if _any_match(_BGC_CONSIDER_BODY_PATTERNS, body_text):
        return "BGC_CONSIDER"
    return "BGC_CLEAR"


def check_bgc_body_with_confidence(body_text: str) -> tuple[str, str]:
    """Check BGC body and return (stage, confidence).

    Returns:
        (stage, confidence) where confidence is 'high' if specific phrase matched,
        'medium' for regex variant match.
    """
    for i, pattern in enumerate(_BGC_CONSIDER_BODY_PATTERNS):
        if pattern.search(body_text):
            # First pattern ("could potentially impact") is most specific
            conf = "high" if i == 0 else "medium"
            return "BGC_CONSIDER", conf
    return "BGC_CLEAR", "high"


def _is_active_signal(subject: str, sender: str) -> bool:
    """Check if email indicates an active Dasher account.

    Uses compiled regex patterns for whitespace tolerance.
    """
    return _any_match(_ACTIVE_PATTERNS, subject)


def _is_bgc_pending_signal(subject: str, sender: str) -> bool:
    """Check if email indicates BGC is in progress.

    Supports multiple BGC vendors (Checkr, Onfido, Sterling, Accurate, Certn).
    Uses compiled regex with whitespace tolerance and 'bgc' abbreviation support.
    """
    if not _is_bgc_vendor(sender):
        return False
    if _any_match(_BGC_PENDING_PATTERNS, subject):
        return True
    # Generic "background check" / "bgc" from vendor, but not "complete"
    if _BGC_GENERIC_PATTERN.search(subject) and not _COMPLETE_PATTERN.search(subject):
        return True
    return False


def _is_identity_verified_signal(subject: str, sender: str) -> bool:
    """Check if email indicates identity verification.

    Uses compiled regex patterns for whitespace tolerance.
    """
    return _any_match(_IDENTITY_VERIFIED_PATTERNS, subject)
