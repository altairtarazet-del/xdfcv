"""Tests for email_classifier module."""
import pytest
from app.services.email_classifier import classify_email, classify_with_threshold, CONFIDENCE_THRESHOLD


class TestClassifyEmail:
    # --- Deactivation ---
    def test_deactivation(self):
        result = classify_email("Your Dasher Account Has Been Deactivated", "noreply@doordash.com")
        assert result is not None
        assert result.category == "account"
        assert result.sub_category == "deactivation"
        assert result.urgency == "critical"
        assert result.action_required is True

    # --- Contract Violation ---
    def test_contract_violation(self):
        result = classify_email("Contract Violation Notice", "noreply@doordash.com")
        assert result is not None
        assert result.category == "warning"
        assert result.sub_category == "contract_violation"
        assert result.urgency == "critical"

    # --- Low Rating ---
    def test_low_rating_warning(self):
        result = classify_email("Low Rating Warning: Your account is at risk", "noreply@doordash.com")
        assert result is not None
        assert result.category == "warning"
        assert result.sub_category == "low_rating_warning"

    # --- BGC Clear ---
    def test_bgc_clear(self):
        result = classify_email("Your background check is complete", "checkr@checkr.com", "All clear, no issues found")
        assert result is not None
        assert result.category == "bgc"
        assert result.sub_category == "clear"

    # --- BGC Consider ---
    def test_bgc_consider(self):
        result = classify_email(
            "Your background check is complete", "checkr@checkr.com",
            "This could potentially impact your ability to dash",
        )
        assert result is not None
        assert result.category == "bgc"
        assert result.sub_category == "consider"
        assert result.urgency == "high"

    # --- BGC Consider: no false positive from broad "consider" ---
    def test_bgc_consider_no_false_positive(self):
        result = classify_email(
            "Your background check is complete", "checkr@checkr.com",
            "Please consider reviewing your profile for accuracy",
        )
        assert result is not None
        assert result.category == "bgc"
        # Body doesn't match the specific "could potentially impact" pattern
        assert result.sub_category == "clear"

    # --- BGC Pending ---
    def test_bgc_pending(self):
        result = classify_email("Your background check is taking longer than expected", "no-reply@checkr.com")
        assert result is not None
        assert result.category == "bgc"
        assert result.sub_category == "pending"

    # --- BGC Pending action_required is bool ---
    def test_bgc_pending_action_required_type(self):
        result = classify_email("More information needed for your background check", "no-reply@checkr.com")
        assert result is not None
        assert result.category == "bgc"
        assert result.sub_category == "pending"
        assert result.action_required is True
        assert isinstance(result.action_required, bool)

    # --- BGC Aliases ---
    def test_bgc_alias_bgc(self):
        result = classify_email("Your BGC is complete", "checkr@checkr.com", "All clear")
        assert result is not None
        assert result.category == "bgc"
        assert result.sub_category == "clear"

    def test_bgc_alias_bg_check(self):
        result = classify_email("Your bg check is complete", "checkr@checkr.com", "All clear")
        assert result is not None
        assert result.category == "bgc"
        assert result.sub_category == "clear"

    # --- Identity Verified ---
    def test_identity_verified_checkr(self):
        result = classify_email("Your identity has been verified", "checkr@checkr.com")
        assert result is not None
        assert result.category == "bgc"
        assert result.sub_category == "identity_verified"

    # --- Welcome ---
    def test_welcome(self):
        result = classify_email("Welcome to DoorDash, Dasher!", "noreply@doordash.com")
        assert result is not None
        assert result.category == "account"
        assert result.sub_category == "welcome"

    # --- Earnings ---
    def test_weekly_pay(self):
        result = classify_email("Your weekly pay is ready", "noreply@doordash.com")
        assert result is not None
        assert result.category == "earnings"
        assert result.sub_category == "weekly_pay"

    def test_direct_deposit(self):
        result = classify_email("Direct deposit processed", "noreply@doordash.com")
        assert result is not None
        assert result.category == "earnings"
        assert result.sub_category == "direct_deposit"

    def test_earnings_summary(self):
        result = classify_email("You earned $150 this week", "noreply@doordash.com")
        assert result is not None
        assert result.category == "earnings"
        assert result.sub_category == "earnings_summary"

    def test_tax_document(self):
        result = classify_email("Your 1099 tax document is ready", "noreply@doordash.com")
        assert result is not None
        assert result.category == "earnings"
        assert result.sub_category == "tax_document"
        assert result.action_required is True

    # --- Operational ---
    def test_dash_opportunity(self):
        result = classify_email("New dash available in your area", "noreply@doordash.com")
        assert result is not None
        assert result.category == "operational"
        assert result.sub_category == "dash_opportunity"

    def test_policy_update(self):
        result = classify_email("Important policy update", "noreply@doordash.com")
        assert result is not None
        assert result.category == "operational"
        assert result.sub_category == "policy_update"

    def test_promotion(self):
        result = classify_email("Peak pay bonus available this weekend", "noreply@doordash.com")
        assert result is not None
        assert result.category == "operational"
        assert result.sub_category == "promotion"

    # --- Survey reclassification (was dash_opportunity, now survey) ---
    def test_survey_reclassified(self):
        result = classify_email("How was your experience?", "noreply@doordash.com")
        assert result is not None
        assert result.category == "operational"
        assert result.sub_category == "survey"

    def test_feedback_survey(self):
        result = classify_email("Quick feedback about your last delivery", "noreply@doordash.com")
        assert result is not None
        assert result.category == "operational"
        assert result.sub_category == "survey"

    # --- Reactivation ---
    def test_reactivation(self):
        result = classify_email("Your Dasher account has been reactivated", "noreply@doordash.com")
        assert result is not None
        assert result.category == "account"
        assert result.sub_category == "reactivation"
        assert result.urgency == "high"

    # --- New category: Insurance ---
    def test_insurance(self):
        result = classify_email("Your Dasher insurance coverage details", "noreply@doordash.com")
        assert result is not None
        assert result.category == "insurance"
        assert result.sub_category == "insurance"

    def test_insurance_workers_comp(self):
        result = classify_email("Workers compensation update", "noreply@doordash.com")
        assert result is not None
        assert result.category == "insurance"

    def test_insurance_liability(self):
        result = classify_email("Liability coverage information", "noreply@doordash.com")
        assert result is not None
        assert result.category == "insurance"

    # --- New category: Scheduling ---
    def test_scheduling_shift(self):
        result = classify_email("New shift available in your area", "noreply@doordash.com")
        assert result is not None
        assert result.category == "scheduling"
        assert result.sub_category == "scheduling"

    def test_scheduling_availability(self):
        result = classify_email("Update your availability preferences", "noreply@doordash.com")
        assert result is not None
        assert result.category == "scheduling"

    def test_scheduling_peak_pay(self):
        result = classify_email("Peak pay tonight in your zone", "noreply@doordash.com")
        assert result is not None
        assert result.category == "scheduling"

    # --- New category: Equipment ---
    def test_equipment_red_card(self):
        result = classify_email("Your red card has been shipped", "noreply@doordash.com")
        assert result is not None
        assert result.category == "equipment"
        assert result.sub_category == "equipment"

    def test_equipment_dasher_kit(self):
        result = classify_email("Your Dasher kit is on the way", "noreply@doordash.com")
        assert result is not None
        assert result.category == "equipment"

    def test_equipment_hot_bag(self):
        result = classify_email("Hot bag pickup instructions", "noreply@doordash.com")
        assert result is not None
        assert result.category == "equipment"

    # --- DoorDash catchall → unknown/needs_review ---
    def test_doordash_catchall_unknown(self):
        result = classify_email("Something unusual", "noreply@doordash.com")
        assert result is not None
        assert result.category == "unknown"
        assert result.sub_category == "needs_review"
        assert result.confidence < CONFIDENCE_THRESHOLD

    # --- Unknown ---
    def test_unknown_email(self):
        result = classify_email("Hello from grandma", "grandma@family.com")
        assert result is None

    def test_low_confidence_doordash(self):
        result = classify_email("Something unusual", "noreply@doordash.com")
        assert result is not None
        assert result.confidence < CONFIDENCE_THRESHOLD

    # --- Dynamic confidence scoring ---
    def test_confidence_range(self):
        """All classified results should have confidence between 0.7 and 1.0."""
        test_cases = [
            ("Your Dasher Account Has Been Deactivated", "noreply@doordash.com", ""),
            ("Contract Violation Notice", "noreply@doordash.com", ""),
            ("Your background check is complete", "checkr@checkr.com", "All clear"),
            ("Your weekly pay is ready", "noreply@doordash.com", ""),
            ("New dash available in your area", "noreply@doordash.com", ""),
        ]
        for subj, sender, body in test_cases:
            result = classify_email(subj, sender, body)
            assert result is not None, f"Expected result for: {subj}"
            assert 0.7 <= result.confidence <= 1.0, f"Confidence {result.confidence} out of range for: {subj}"


class TestClassifyWithThreshold:
    def test_high_confidence_no_ai(self):
        result, needs_ai = classify_with_threshold("Your Dasher Account Has Been Deactivated", "noreply@doordash.com")
        assert result is not None
        assert needs_ai is False

    def test_unknown_needs_ai(self):
        result, needs_ai = classify_with_threshold("Random unknown email", "unknown@example.com")
        assert needs_ai is True

    def test_low_confidence_needs_ai(self):
        result, needs_ai = classify_with_threshold("Something from DoorDash", "noreply@doordash.com")
        assert needs_ai is True
