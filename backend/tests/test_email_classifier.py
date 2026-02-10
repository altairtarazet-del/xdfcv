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

    # --- BGC Pending ---
    def test_bgc_pending(self):
        result = classify_email("Your background check is taking longer than expected", "no-reply@checkr.com")
        assert result is not None
        assert result.category == "bgc"
        assert result.sub_category == "pending"

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

    # --- Reactivation ---
    def test_reactivation(self):
        result = classify_email("Your Dasher account has been reactivated", "noreply@doordash.com")
        assert result is not None
        assert result.category == "account"
        assert result.sub_category == "reactivation"
        assert result.urgency == "high"

    # --- Unknown ---
    def test_unknown_email(self):
        result = classify_email("Hello from grandma", "grandma@family.com")
        assert result is None

    def test_low_confidence_doordash(self):
        result = classify_email("Something unusual", "noreply@doordash.com")
        assert result is not None
        assert result.confidence < CONFIDENCE_THRESHOLD


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
