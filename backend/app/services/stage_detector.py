"""
7-Stage Account Detection

Priority (highest wins):
  DEACTIVATED > ACTIVE > BGC_CONSIDER > BGC_CLEAR > BGC_PENDING > IDENTITY_VERIFIED > REGISTERED

Detection signals (from email subjects/senders):
  1. REGISTERED         — Account exists in SMTP.dev but no DoorDash email found
  2. IDENTITY_VERIFIED  — Checkr "identity/information verified" email
  3. BGC_PENDING        — Checkr BGC submitted/processing emails
  4. BGC_CLEAR          — "Your background check is complete" + no "consider" in body
  5. BGC_CONSIDER       — "Your background check is complete" + "could potentially impact" in body
  6. ACTIVE             — Earnings/delivery/payment emails from DoorDash
  7. DEACTIVATED        — "Your dasher account has been deactivated"
"""

import re

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


def _lower(s: str | None) -> str:
    return (s or "").lower().strip()


def detect_stage_from_messages(messages: list[dict], get_body_fn=None) -> tuple[str, str | None, str | None]:
    """
    Analyze email messages to detect the account stage.

    Args:
        messages: List of message dicts with at least 'subject', 'from'/'sender' fields
        get_body_fn: Not used in sync detection. Body check is handled separately.

    Returns:
        (stage, trigger_subject, trigger_date) tuple
    """
    detected_stage = "REGISTERED"
    trigger_subject = None
    trigger_date = None
    needs_body_check = []  # Messages that need body content to distinguish BGC_CLEAR vs BGC_CONSIDER

    for msg in messages:
        subject = _lower(msg.get("subject", ""))
        sender = _lower(msg.get("from", msg.get("sender", "")))

        # DEACTIVATED — highest priority
        if "dasher account has been deactivated" in subject:
            return "DEACTIVATED", msg.get("subject"), msg.get("date", msg.get("created_at"))

        # ACTIVE — earnings/delivery/payment emails
        if _is_active_signal(subject, sender):
            if STAGE_PRIORITY["ACTIVE"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "ACTIVE"
                trigger_subject = msg.get("subject")
                trigger_date = msg.get("date", msg.get("created_at"))

        # BGC COMPLETE — needs body to determine CLEAR vs CONSIDER
        elif "background check is complete" in subject:
            needs_body_check.append(msg)
            # For now, mark as at least BGC_CLEAR (will be upgraded to CONSIDER if body matches)
            if STAGE_PRIORITY["BGC_CLEAR"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "BGC_CLEAR"
                trigger_subject = msg.get("subject")
                trigger_date = msg.get("date", msg.get("created_at"))

        # BGC_PENDING — Checkr processing
        elif _is_bgc_pending_signal(subject, sender):
            if STAGE_PRIORITY["BGC_PENDING"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "BGC_PENDING"
                trigger_subject = msg.get("subject")
                trigger_date = msg.get("date", msg.get("created_at"))

        # IDENTITY_VERIFIED — Checkr identity verification
        elif _is_identity_verified_signal(subject, sender):
            if STAGE_PRIORITY["IDENTITY_VERIFIED"] > STAGE_PRIORITY[detected_stage]:
                detected_stage = "IDENTITY_VERIFIED"
                trigger_subject = msg.get("subject")
                trigger_date = msg.get("date", msg.get("created_at"))

    return detected_stage, trigger_subject, trigger_date, needs_body_check


def check_bgc_body(body_text: str) -> str:
    """Check BGC completion email body to determine CLEAR vs CONSIDER."""
    body_lower = body_text.lower()
    if "could potentially impact" in body_lower or "consider" in body_lower:
        return "BGC_CONSIDER"
    return "BGC_CLEAR"


def _is_active_signal(subject: str, sender: str) -> bool:
    """Check if email indicates an active Dasher account."""
    active_patterns = [
        "your weekly pay",
        "weekly earnings",
        "direct deposit",
        "you earned",
        "delivery summary",
        "dasher pay",
        "payment processed",
        "new dash available",
        "time to dash",
        "your earnings",
        "pay statement",
        "fast pay transfer",
        "prop 22 healthcare",
        "dasher welcome gift",
        "how was your experience",
        "dasher bank account",
    ]
    return any(p in subject for p in active_patterns)


def _is_bgc_pending_signal(subject: str, sender: str) -> bool:
    """Check if email indicates BGC is in progress."""
    # Must be from checkr AND subject indicates BGC activity (not completion)
    if "checkr" not in sender:
        return False
    pending_patterns = [
        "background check is taking longer",
        "background check paused",
        "more information needed",
        "let's find your background check",
        "agreed to checkr",
        "verify your email",
        "finish your personal check",
    ]
    if any(p in subject for p in pending_patterns):
        return True
    # Generic "background check" from checkr, but not "complete"
    if "background check" in subject and "complete" not in subject:
        return True
    return False


def _is_identity_verified_signal(subject: str, sender: str) -> bool:
    """Check if email indicates identity verification."""
    return (
        ("identity" in subject and "verified" in subject)
        or ("information verified" in subject)
        or ("identity verification" in subject and "complete" in subject)
    )
