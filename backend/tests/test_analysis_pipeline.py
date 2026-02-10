"""Tests for analysis_pipeline module (unit tests, no DB needed)."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.email_classifier import classify_email, ClassificationResult


class TestClassificationIntegration:
    """Test the classification flow without DB."""

    def test_deactivation_creates_critical_result(self):
        result = classify_email("Your Dasher Account Has Been Deactivated", "noreply@doordash.com")
        assert result.category == "account"
        assert result.sub_category == "deactivation"
        assert result.urgency == "critical"
        assert result.confidence == 1.0

    def test_bgc_clear_vs_consider(self):
        clear = classify_email("Your background check is complete", "checkr@checkr.com", "All good")
        assert clear.sub_category == "clear"

        consider = classify_email(
            "Your background check is complete", "checkr@checkr.com",
            "This could potentially impact your status"
        )
        assert consider.sub_category == "consider"

    def test_classification_result_to_dict(self):
        result = ClassificationResult(
            category="bgc",
            sub_category="clear",
            confidence=0.95,
            summary="BGC complete",
            urgency="medium",
            action_required=False,
        )
        d = result.to_dict()
        assert d["category"] == "bgc"
        assert d["confidence"] == 0.95
        assert d["action_required"] is False

    def test_multiple_earnings_types(self):
        types = [
            ("Your weekly pay is ready", "weekly_pay"),
            ("Direct deposit processed", "direct_deposit"),
            ("You earned $200 this week", "earnings_summary"),
            ("Your 1099 tax document", "tax_document"),
        ]
        for subject, expected_sub in types:
            result = classify_email(subject, "noreply@doordash.com")
            assert result is not None, f"Failed for: {subject}"
            assert result.category == "earnings", f"Wrong category for: {subject}"
            assert result.sub_category == expected_sub, f"Wrong sub_category for: {subject}"

    def test_warning_categories(self):
        cv = classify_email("Contract violation notice", "noreply@doordash.com")
        assert cv.category == "warning"
        assert cv.sub_category == "contract_violation"

        lr = classify_email("Low rating warning for your account", "noreply@doordash.com")
        assert lr.category == "warning"
        assert lr.sub_category == "low_rating_warning"

    def test_unknown_non_doordash_returns_none(self):
        result = classify_email("Meeting tomorrow at 3pm", "colleague@company.com")
        assert result is None
