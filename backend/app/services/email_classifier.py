"""
Rule-based email classifier for DoorDash emails.

Categories:
  - BGC: submitted, pending, clear, consider, identity_verified
  - Account: welcome, activation, deactivation, reactivation
  - Earnings: weekly_pay, direct_deposit, earnings_summary, tax_document
  - Operational: dash_opportunity, rating_update, policy_update, promotion, survey
  - Insurance: insurance-related emails
  - Scheduling: shift/schedule emails
  - Equipment: Red Card, kit, bags
  - Warning: contract_violation, low_rating_warning
  - Unknown: needs_review (forwarded to AI)
"""
import re
from dataclasses import dataclass, field


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


# ---------------------------------------------------------------------------
# Pattern definitions grouped by category using dataclasses
# ---------------------------------------------------------------------------

@dataclass
class PatternRule:
    """A single classification pattern rule."""
    pattern: re.Pattern
    category: str
    sub_category: str
    confidence: float
    summary: str
    urgency: str = "low"
    action_required: bool = False
    match_field: str = "subject"  # "subject", "body", "sender"


@dataclass
class CategoryPatterns:
    """Group of pattern rules for a category."""
    name: str
    rules: list[PatternRule] = field(default_factory=list)


# Compiled regex patterns -- re.IGNORECASE for all
_BGC_ALIASES = r"(?:background\s*check|bgc|bg\s*check)"

CATEGORY_PATTERNS: list[CategoryPatterns] = [
    # --- ACCOUNT ---
    CategoryPatterns(name="account", rules=[
        PatternRule(
            pattern=re.compile(r"dasher\s+account\s+has\s+been\s+deactivated", re.IGNORECASE),
            category="account", sub_category="deactivation",
            confidence=1.0, summary="Dasher account has been deactivated",
            urgency="critical", action_required=True,
        ),
        PatternRule(
            pattern=re.compile(r"reactivat", re.IGNORECASE),
            category="account", sub_category="reactivation",
            confidence=0.9, summary="Account reactivation notification",
            urgency="high", action_required=True,
        ),
        PatternRule(
            pattern=re.compile(r"welcome.*(?:dasher|doordash)", re.IGNORECASE),
            category="account", sub_category="welcome",
            confidence=0.9, summary="Welcome to DoorDash/Dasher",
            urgency="info", action_required=False,
        ),
        PatternRule(
            pattern=re.compile(r"account.*activat(?!.*deactivat)", re.IGNORECASE),
            category="account", sub_category="activation",
            confidence=0.85, summary="Account activation notification",
            urgency="medium", action_required=False,
        ),
    ]),

    # --- WARNING ---
    CategoryPatterns(name="warning", rules=[
        PatternRule(
            pattern=re.compile(r"contract\s+violation|violation\s+notice", re.IGNORECASE),
            category="warning", sub_category="contract_violation",
            confidence=0.95, summary="Contract violation reported",
            urgency="critical", action_required=True,
        ),
        PatternRule(
            pattern=re.compile(r"rating.*(?:warning|low|risk)", re.IGNORECASE),
            category="warning", sub_category="low_rating_warning",
            confidence=0.85, summary="Low rating warning received",
            urgency="warning", action_required=True,
        ),
    ]),

    # --- EARNINGS ---
    CategoryPatterns(name="earnings", rules=[
        PatternRule(
            pattern=re.compile(r"(?:your\s+)?weekly\s+(?:pay|earnings)|pay\s+statement", re.IGNORECASE),
            category="earnings", sub_category="weekly_pay",
            confidence=0.95, summary="Weekly pay statement",
            urgency="low", action_required=False,
        ),
        PatternRule(
            pattern=re.compile(r"direct\s+deposit|fast\s+pay\s+transfer", re.IGNORECASE),
            category="earnings", sub_category="direct_deposit",
            confidence=0.95, summary="Direct deposit or fast pay notification",
            urgency="low", action_required=False,
        ),
        PatternRule(
            pattern=re.compile(r"you\s+earned|your\s+earnings|earnings\s+summary|delivery\s+summary", re.IGNORECASE),
            category="earnings", sub_category="earnings_summary",
            confidence=0.9, summary="Earnings or delivery summary",
            urgency="low", action_required=False,
        ),
        PatternRule(
            pattern=re.compile(r"1099|tax\s+document|tax\s+form|tax\s+statement", re.IGNORECASE),
            category="earnings", sub_category="tax_document",
            confidence=0.95, summary="Tax document available",
            urgency="medium", action_required=True,
        ),
        PatternRule(
            pattern=re.compile(r"payment\s+processed|dasher\s+pay|dasher\s+bank|dasher\s+welcome\s+gift", re.IGNORECASE),
            category="earnings", sub_category="direct_deposit",
            confidence=0.8, summary="Payment or bank related notification",
            urgency="low", action_required=False,
        ),
    ]),

    # --- OPERATIONAL ---
    CategoryPatterns(name="operational", rules=[
        PatternRule(
            pattern=re.compile(r"new\s+dash\s+available|time\s+to\s+dash|dash\s+opportunity|busy\s+near\s+you", re.IGNORECASE),
            category="operational", sub_category="dash_opportunity",
            confidence=0.85, summary="Dash opportunity available",
            urgency="info", action_required=False,
        ),
        PatternRule(
            pattern=re.compile(r"rating.*update", re.IGNORECASE),
            category="operational", sub_category="rating_update",
            confidence=0.8, summary="Rating update notification",
            urgency="low", action_required=False,
        ),
        PatternRule(
            pattern=re.compile(r"policy\s+update|terms\s+of\s+service|agreement\s+update|ica\s+update", re.IGNORECASE),
            category="operational", sub_category="policy_update",
            confidence=0.85, summary="Policy or terms update",
            urgency="medium", action_required=True,
        ),
        PatternRule(
            pattern=re.compile(r"promotion|bonus|challenge|peak\s+pay|incentive|prop\s+22", re.IGNORECASE),
            category="operational", sub_category="promotion",
            confidence=0.8, summary="Promotion or incentive notification",
            urgency="info", action_required=False,
        ),
        PatternRule(
            pattern=re.compile(r"how\s+was\s+your\s+experience|survey|feedback", re.IGNORECASE),
            category="operational", sub_category="survey",
            confidence=0.7, summary="Experience feedback request",
            urgency="info", action_required=False,
        ),
    ]),

    # --- INSURANCE (new) ---
    CategoryPatterns(name="insurance", rules=[
        PatternRule(
            pattern=re.compile(r"insurance|coverage|claim|liability|workers.*comp", re.IGNORECASE),
            category="insurance", sub_category="insurance",
            confidence=0.85, summary="Dasher insurance related notification",
            urgency="medium", action_required=False,
        ),
    ]),

    # --- SCHEDULING (new) ---
    CategoryPatterns(name="scheduling", rules=[
        PatternRule(
            pattern=re.compile(r"schedule|shift|availability|time\s+slot", re.IGNORECASE),
            category="scheduling", sub_category="scheduling",
            confidence=0.85, summary="Shift or schedule notification",
            urgency="low", action_required=False,
        ),
    ]),

    # --- EQUIPMENT (new) ---
    CategoryPatterns(name="equipment", rules=[
        PatternRule(
            pattern=re.compile(r"red\s+card|activation\s+kit|hot\s+bag|equipment|dasher\s+kit", re.IGNORECASE),
            category="equipment", sub_category="equipment",
            confidence=0.85, summary="Equipment or kit notification",
            urgency="low", action_required=False,
        ),
    ]),
]


# ---------------------------------------------------------------------------
# Compiled BGC-specific patterns (need special multi-field logic)
# ---------------------------------------------------------------------------

_RE_BGC_COMPLETE = re.compile(_BGC_ALIASES + r".*(?:is\s+)?complete", re.IGNORECASE)
_RE_BGC_CONSIDER = re.compile(
    r"could\s+potentially\s+impact|(?:record|item).*(?:found|flagged)|adverse.*(?:action|finding)",
    re.IGNORECASE,
)
_RE_BGC_PENDING = re.compile(
    _BGC_ALIASES + r".*(?:taking\s+longer|paused)|more\s+information\s+needed|finish\s+your\s+personal\s+check",
    re.IGNORECASE,
)
_RE_BGC_SUBMITTED = re.compile(_BGC_ALIASES + r"(?!.*complete)", re.IGNORECASE)
_RE_IDENTITY_VERIFIED = re.compile(r"identity.*verified|information\s+verified", re.IGNORECASE)
_RE_CHECKR_CONSENT = re.compile(r"agreed\s+to\s+checkr|verify\s+your\s+email", re.IGNORECASE)
_RE_MORE_INFO = re.compile(r"more\s+information", re.IGNORECASE)
_RE_CHECKR_SENDER = re.compile(r"checkr", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Dynamic confidence scoring
# ---------------------------------------------------------------------------

def _score_confidence(base: float, match_type: str) -> float:
    """Adjust confidence based on pattern match quality."""
    if match_type == "exact":
        return min(1.0, max(0.7, base))
    elif match_type == "regex":
        return min(1.0, max(0.7, base * 0.95)) if base >= 0.9 else max(0.7, base)
    else:  # category_only — no sub_category specificity
        return 0.7


def _lower(s: str | None) -> str:
    return (s or "").lower().strip()


# ---------------------------------------------------------------------------
# Main classifier
# ---------------------------------------------------------------------------

def classify_email(subject: str, sender: str, body: str = "") -> ClassificationResult | None:
    """
    Classify a DoorDash email using rule-based pattern matching.
    Returns ClassificationResult or None if confidence < 0.7 (should go to AI).
    """
    subj = _lower(subject)
    sndr = _lower(sender)
    body_lower = _lower(body)
    text = subj + " " + body_lower

    # === DEACTIVATION (critical, check first) ===
    if re.search(r"dasher\s+account\s+has\s+been\s+deactivated", subj, re.IGNORECASE):
        return ClassificationResult(
            category="account", sub_category="deactivation",
            confidence=1.0,
            summary="Dasher account has been deactivated",
            urgency="critical", action_required=True,
        )

    # === REACTIVATION ===
    if re.search(r"reactivat", subj, re.IGNORECASE) and (
        re.search(r"dasher", subj, re.IGNORECASE) or re.search(r"doordash", sndr, re.IGNORECASE)
    ):
        return ClassificationResult(
            category="account", sub_category="reactivation",
            confidence=_score_confidence(0.9, "regex"),
            summary="Account reactivation notification",
            urgency="high", action_required=True,
        )

    # === CONTRACT VIOLATION (critical) ===
    if re.search(r"contract\s+violation|violation\s+notice", subj, re.IGNORECASE):
        return ClassificationResult(
            category="warning", sub_category="contract_violation",
            confidence=_score_confidence(0.95, "exact"),
            summary="Contract violation reported",
            urgency="critical", action_required=True,
        )

    # === LOW RATING WARNING ===
    if re.search(r"rating", subj, re.IGNORECASE) and re.search(r"warning|low|risk", subj, re.IGNORECASE):
        return ClassificationResult(
            category="warning", sub_category="low_rating_warning",
            confidence=_score_confidence(0.85, "regex"),
            summary="Low rating warning received",
            urgency="warning", action_required=True,
        )

    # === BGC: Background Check Complete ===
    if _RE_BGC_COMPLETE.search(subj):
        if _RE_BGC_CONSIDER.search(body_lower):
            return ClassificationResult(
                category="bgc", sub_category="consider",
                confidence=_score_confidence(1.0, "exact"),
                summary="Background check complete with considerations",
                urgency="high", action_required=True,
            )
        return ClassificationResult(
            category="bgc", sub_category="clear",
            confidence=_score_confidence(0.95, "regex"),
            summary="Background check completed clear",
            urgency="medium", action_required=False,
        )

    # === BGC: Checkr sender ===
    if _RE_CHECKR_SENDER.search(sndr):
        if _RE_BGC_PENDING.search(subj):
            return ClassificationResult(
                category="bgc", sub_category="pending",
                confidence=_score_confidence(0.9, "regex"),
                summary="Background check in progress, action may be needed",
                urgency="medium",
                action_required=bool(_RE_MORE_INFO.search(subj)),
            )
        if _RE_BGC_SUBMITTED.search(subj) and not re.search(r"complete", subj, re.IGNORECASE):
            return ClassificationResult(
                category="bgc", sub_category="submitted",
                confidence=_score_confidence(0.85, "regex"),
                summary="Background check submitted/processing",
                urgency="low", action_required=False,
            )
        if _RE_IDENTITY_VERIFIED.search(subj):
            return ClassificationResult(
                category="bgc", sub_category="identity_verified",
                confidence=_score_confidence(0.95, "exact"),
                summary="Identity verification completed",
                urgency="medium", action_required=False,
            )
        if _RE_CHECKR_CONSENT.search(subj):
            return ClassificationResult(
                category="bgc", sub_category="submitted",
                confidence=_score_confidence(0.8, "regex"),
                summary="Checkr consent/verification step",
                urgency="low", action_required=False,
            )

    # === IDENTITY VERIFIED (non-Checkr) ===
    if _RE_IDENTITY_VERIFIED.search(subj):
        return ClassificationResult(
            category="bgc", sub_category="identity_verified",
            confidence=_score_confidence(0.9, "regex"),
            summary="Identity verification completed",
            urgency="medium", action_required=False,
        )

    # === WELCOME ===
    if re.search(r"welcome", subj, re.IGNORECASE) and (
        re.search(r"dasher", subj, re.IGNORECASE) or re.search(r"doordash", sndr, re.IGNORECASE)
    ):
        return ClassificationResult(
            category="account", sub_category="welcome",
            confidence=_score_confidence(0.9, "regex"),
            summary="Welcome to DoorDash/Dasher",
            urgency="info", action_required=False,
        )

    # === ACTIVATION (not deactivation) ===
    if re.search(r"account.*activat", subj, re.IGNORECASE) and not re.search(r"deactivat", subj, re.IGNORECASE):
        return ClassificationResult(
            category="account", sub_category="activation",
            confidence=_score_confidence(0.85, "regex"),
            summary="Account activation notification",
            urgency="medium", action_required=False,
        )

    # === EARNINGS: Weekly Pay ===
    if re.search(r"(?:your\s+)?weekly\s+(?:pay|earnings)|pay\s+statement", subj, re.IGNORECASE):
        return ClassificationResult(
            category="earnings", sub_category="weekly_pay",
            confidence=_score_confidence(0.95, "exact"),
            summary="Weekly pay statement",
            urgency="low", action_required=False,
        )

    # === EARNINGS: Direct Deposit ===
    if re.search(r"direct\s+deposit|fast\s+pay\s+transfer", subj, re.IGNORECASE):
        return ClassificationResult(
            category="earnings", sub_category="direct_deposit",
            confidence=_score_confidence(0.95, "exact"),
            summary="Direct deposit or fast pay notification",
            urgency="low", action_required=False,
        )

    # === EARNINGS: Summary ===
    if re.search(r"you\s+earned|your\s+earnings|earnings\s+summary|delivery\s+summary", subj, re.IGNORECASE):
        return ClassificationResult(
            category="earnings", sub_category="earnings_summary",
            confidence=_score_confidence(0.9, "regex"),
            summary="Earnings or delivery summary",
            urgency="low", action_required=False,
        )

    # === EARNINGS: Tax ===
    if re.search(r"1099|tax\s+document|tax\s+form|tax\s+statement", subj, re.IGNORECASE):
        return ClassificationResult(
            category="earnings", sub_category="tax_document",
            confidence=_score_confidence(0.95, "exact"),
            summary="Tax document available",
            urgency="medium", action_required=True,
        )

    # === EARNINGS: First Dash Complete (strong ACTIVE signal) ===
    if re.search(r"first\s+dash.*(?:done|complete|finished)|your\s+first\s+dash|congratulations.*first\s+dash|you\s+completed.*(?:first\s+)?dash", subj, re.IGNORECASE):
        return ClassificationResult(
            category="earnings", sub_category="earnings_summary",
            confidence=_score_confidence(0.95, "exact"),
            summary="First dash completed - account is active",
            urgency="low", action_required=False,
        )

    # === OPERATIONAL: Dash Opportunity ===
    if re.search(r"new\s+dash\s+available|time\s+to\s+dash|dash\s+opportunity|busy\s+near\s+you", subj, re.IGNORECASE):
        return ClassificationResult(
            category="operational", sub_category="dash_opportunity",
            confidence=_score_confidence(0.85, "regex"),
            summary="Dash opportunity available",
            urgency="info", action_required=False,
        )

    # === OPERATIONAL: Rating Update (not warning) ===
    if re.search(r"rating", subj, re.IGNORECASE) and re.search(r"update", subj, re.IGNORECASE):
        return ClassificationResult(
            category="operational", sub_category="rating_update",
            confidence=_score_confidence(0.8, "regex"),
            summary="Rating update notification",
            urgency="low", action_required=False,
        )

    # === OPERATIONAL: Policy Update ===
    if re.search(r"policy\s+update|terms\s+of\s+service|agreement\s+update|ica\s+update", subj, re.IGNORECASE):
        return ClassificationResult(
            category="operational", sub_category="policy_update",
            confidence=_score_confidence(0.85, "regex"),
            summary="Policy or terms update",
            urgency="medium", action_required=True,
        )

    # === OPERATIONAL: Survey/Feedback (moved from dash_opportunity) ===
    if re.search(r"how\s+was\s+your\s+experience|survey|feedback", subj, re.IGNORECASE):
        return ClassificationResult(
            category="operational", sub_category="survey",
            confidence=_score_confidence(0.7, "regex"),
            summary="Experience feedback request",
            urgency="info", action_required=False,
        )

    # === OPERATIONAL: Promotion ===
    if re.search(r"promotion|bonus|challenge|incentive|prop\s+22", subj, re.IGNORECASE):
        return ClassificationResult(
            category="operational", sub_category="promotion",
            confidence=_score_confidence(0.8, "regex"),
            summary="Promotion or incentive notification",
            urgency="info", action_required=False,
        )

    # === EARNINGS: Payment/Bank ===
    if re.search(r"payment\s+processed|dasher\s+pay|dasher\s+bank|dasher\s+welcome\s+gift", subj, re.IGNORECASE):
        return ClassificationResult(
            category="earnings", sub_category="direct_deposit",
            confidence=_score_confidence(0.8, "regex"),
            summary="Payment or bank related notification",
            urgency="low", action_required=False,
        )

    # === INSURANCE (new) ===
    if re.search(r"insurance|coverage|claim|liability|workers.*comp", subj, re.IGNORECASE):
        return ClassificationResult(
            category="insurance", sub_category="insurance",
            confidence=_score_confidence(0.85, "regex"),
            summary="Dasher insurance related notification",
            urgency="medium", action_required=False,
        )

    # === SCHEDULING (new) ===
    if re.search(r"schedule|shift|availability|time\s+slot|peak\s+pay", subj, re.IGNORECASE):
        return ClassificationResult(
            category="scheduling", sub_category="scheduling",
            confidence=_score_confidence(0.85, "regex"),
            summary="Shift or schedule notification",
            urgency="low", action_required=False,
        )

    # === EQUIPMENT (new) ===
    if re.search(r"red\s+card|activation\s+kit|hot\s+bag|equipment|dasher\s+kit", subj, re.IGNORECASE):
        return ClassificationResult(
            category="equipment", sub_category="equipment",
            confidence=_score_confidence(0.85, "regex"),
            summary="Equipment or kit notification",
            urgency="low", action_required=False,
        )

    # === DoorDash catchall → unknown/needs_review (changed from policy_update) ===
    if re.search(r"doordash", sndr, re.IGNORECASE):
        return ClassificationResult(
            category="unknown", sub_category="needs_review",
            confidence=0.5,
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
