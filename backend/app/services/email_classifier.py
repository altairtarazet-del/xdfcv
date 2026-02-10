"""
Rule-based email classifier for DoorDash emails.

Categories:
  - BGC: submitted, pending, clear, consider, identity_verified
  - Account: welcome, activation, deactivation, reactivation
  - Earnings: weekly_pay, direct_deposit, earnings_summary, tax_document
  - Operational: dash_opportunity, rating_update, policy_update, promotion
  - Warning: contract_violation, low_rating_warning
  - Unknown: unclassified (forwarded to AI)
"""
import re


class ClassificationResult:
    def __init__(
        self,
        category: str,
        sub_category: str,
        confidence: float,
        summary: str,
        urgency: str = "low",
        action_required: bool = False,
    ):
        self.category = category
        self.sub_category = sub_category
        self.confidence = confidence
        self.summary = summary
        self.urgency = urgency
        self.action_required = action_required

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "sub_category": self.sub_category,
            "confidence": self.confidence,
            "summary": self.summary,
            "urgency": self.urgency,
            "action_required": self.action_required,
        }


def _lower(s: str | None) -> str:
    return (s or "").lower().strip()


def classify_email(subject: str, sender: str, body: str = "") -> ClassificationResult | None:
    """
    Classify a DoorDash email using rule-based pattern matching.
    Returns ClassificationResult or None if confidence < 0.7 (should go to AI).
    """
    subj = _lower(subject)
    sndr = _lower(sender)
    body_lower = _lower(body)

    # --- DEACTIVATION (Critical) ---
    if "dasher account has been deactivated" in subj:
        return ClassificationResult(
            category="account", sub_category="deactivation",
            confidence=1.0,
            summary="Dasher account has been deactivated",
            urgency="critical", action_required=True,
        )

    # --- REACTIVATION ---
    if "reactivat" in subj and ("dasher" in subj or "doordash" in sndr):
        return ClassificationResult(
            category="account", sub_category="reactivation",
            confidence=0.9,
            summary="Account reactivation notification",
            urgency="high", action_required=True,
        )

    # --- CONTRACT VIOLATION (Critical) ---
    if "contract violation" in subj or "violation notice" in subj:
        return ClassificationResult(
            category="warning", sub_category="contract_violation",
            confidence=0.95,
            summary="Contract violation reported",
            urgency="critical", action_required=True,
        )

    # --- LOW RATING WARNING ---
    if ("rating" in subj and ("warning" in subj or "low" in subj or "risk" in subj)):
        return ClassificationResult(
            category="warning", sub_category="low_rating_warning",
            confidence=0.85,
            summary="Low rating warning received",
            urgency="warning", action_required=True,
        )

    # --- BGC: Background Check Complete ---
    if "background check is complete" in subj:
        if "could potentially impact" in body_lower or "consider" in body_lower:
            return ClassificationResult(
                category="bgc", sub_category="consider",
                confidence=1.0,
                summary="Background check complete with considerations",
                urgency="high", action_required=True,
            )
        return ClassificationResult(
            category="bgc", sub_category="clear",
            confidence=0.95,
            summary="Background check completed clear",
            urgency="medium", action_required=False,
        )

    # --- BGC: Pending/Processing ---
    if "checkr" in sndr:
        if any(p in subj for p in [
            "background check is taking longer", "background check paused",
            "more information needed", "finish your personal check",
        ]):
            return ClassificationResult(
                category="bgc", sub_category="pending",
                confidence=0.9,
                summary="Background check in progress, action may be needed",
                urgency="medium", action_required="more information" in subj,
            )
        if "background check" in subj and "complete" not in subj:
            return ClassificationResult(
                category="bgc", sub_category="submitted",
                confidence=0.85,
                summary="Background check submitted/processing",
                urgency="low", action_required=False,
            )
        if "identity" in subj and "verified" in subj:
            return ClassificationResult(
                category="bgc", sub_category="identity_verified",
                confidence=0.95,
                summary="Identity verification completed",
                urgency="medium", action_required=False,
            )
        if "agreed to checkr" in subj or "verify your email" in subj:
            return ClassificationResult(
                category="bgc", sub_category="submitted",
                confidence=0.8,
                summary="Checkr consent/verification step",
                urgency="low", action_required=False,
            )

    # --- IDENTITY VERIFIED (non-Checkr sources) ---
    if ("identity" in subj and "verified" in subj) or "information verified" in subj:
        return ClassificationResult(
            category="bgc", sub_category="identity_verified",
            confidence=0.9,
            summary="Identity verification completed",
            urgency="medium", action_required=False,
        )

    # --- WELCOME ---
    if ("welcome" in subj and ("dasher" in subj or "doordash" in sndr)):
        return ClassificationResult(
            category="account", sub_category="welcome",
            confidence=0.9,
            summary="Welcome to DoorDash/Dasher",
            urgency="info", action_required=False,
        )

    # --- ACTIVATION ---
    if "account" in subj and "activat" in subj and "deactivat" not in subj:
        return ClassificationResult(
            category="account", sub_category="activation",
            confidence=0.85,
            summary="Account activation notification",
            urgency="medium", action_required=False,
        )

    # --- EARNINGS: Weekly Pay ---
    if any(p in subj for p in ["your weekly pay", "weekly earnings", "pay statement"]):
        return ClassificationResult(
            category="earnings", sub_category="weekly_pay",
            confidence=0.95,
            summary="Weekly pay statement",
            urgency="low", action_required=False,
        )

    # --- EARNINGS: Direct Deposit ---
    if "direct deposit" in subj or "fast pay transfer" in subj:
        return ClassificationResult(
            category="earnings", sub_category="direct_deposit",
            confidence=0.95,
            summary="Direct deposit or fast pay notification",
            urgency="low", action_required=False,
        )

    # --- EARNINGS: Earnings Summary ---
    if any(p in subj for p in ["you earned", "your earnings", "earnings summary", "delivery summary"]):
        return ClassificationResult(
            category="earnings", sub_category="earnings_summary",
            confidence=0.9,
            summary="Earnings or delivery summary",
            urgency="low", action_required=False,
        )

    # --- EARNINGS: Tax Document ---
    if any(p in subj for p in ["1099", "tax document", "tax form", "tax statement"]):
        return ClassificationResult(
            category="earnings", sub_category="tax_document",
            confidence=0.95,
            summary="Tax document available",
            urgency="medium", action_required=True,
        )

    # --- OPERATIONAL: Dash Opportunity ---
    if any(p in subj for p in ["new dash available", "time to dash", "dash opportunity", "busy near you"]):
        return ClassificationResult(
            category="operational", sub_category="dash_opportunity",
            confidence=0.85,
            summary="Dash opportunity available",
            urgency="info", action_required=False,
        )

    # --- OPERATIONAL: Rating Update ---
    if "rating" in subj and "update" in subj:
        return ClassificationResult(
            category="operational", sub_category="rating_update",
            confidence=0.8,
            summary="Rating update notification",
            urgency="low", action_required=False,
        )

    # --- OPERATIONAL: Policy Update ---
    if any(p in subj for p in ["policy update", "terms of service", "agreement update", "ica update"]):
        return ClassificationResult(
            category="operational", sub_category="policy_update",
            confidence=0.85,
            summary="Policy or terms update",
            urgency="medium", action_required=True,
        )

    # --- OPERATIONAL: Promotion ---
    if any(p in subj for p in ["promotion", "bonus", "challenge", "peak pay", "incentive", "prop 22"]):
        return ClassificationResult(
            category="operational", sub_category="promotion",
            confidence=0.8,
            summary="Promotion or incentive notification",
            urgency="info", action_required=False,
        )

    # --- OPERATIONAL: Payment/Bank ---
    if any(p in subj for p in ["payment processed", "dasher pay", "dasher bank", "dasher welcome gift"]):
        return ClassificationResult(
            category="earnings", sub_category="direct_deposit",
            confidence=0.8,
            summary="Payment or bank related notification",
            urgency="low", action_required=False,
        )

    # --- OPERATIONAL: Experience/Survey ---
    if "how was your experience" in subj or "survey" in subj or "feedback" in subj:
        return ClassificationResult(
            category="operational", sub_category="dash_opportunity",
            confidence=0.7,
            summary="Experience feedback request",
            urgency="info", action_required=False,
        )

    # --- DoorDash sender but unclassified ---
    if "doordash" in sndr or "noreply@doordash" in sndr:
        return ClassificationResult(
            category="operational", sub_category="policy_update",
            confidence=0.5,  # Low confidence → will go to AI
            summary="Unclassified DoorDash email",
            urgency="low", action_required=False,
        )

    # Unknown — confidence too low, should be sent to AI
    return None


CONFIDENCE_THRESHOLD = 0.7


def classify_with_threshold(subject: str, sender: str, body: str = "") -> tuple[ClassificationResult | None, bool]:
    """
    Classify and return (result, needs_ai).
    If result is None or confidence < threshold, needs_ai = True.
    """
    result = classify_email(subject, sender, body)
    if result is None or result.confidence < CONFIDENCE_THRESHOLD:
        return result, True
    return result, False
