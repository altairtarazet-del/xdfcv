"""Tests for stage_detector module."""
import pytest
from app.services.stage_detector import (
    detect_stage_from_messages,
    detect_stage_with_metadata,
    check_bgc_body,
    check_bgc_body_with_confidence,
    _is_active_signal,
    _is_bgc_pending_signal,
    _is_identity_verified_signal,
    _is_bgc_vendor,
    BGC_VENDORS,
)


class TestDetectStage:
    def test_deactivated_highest_priority(self):
        messages = [
            {"subject": "Your Dasher Account Has Been Deactivated", "from": "noreply@doordash.com", "date": "2024-01-01"},
            {"subject": "Your weekly pay is ready", "from": "noreply@doordash.com", "date": "2024-01-02"},
        ]
        stage, subject, date, body_check = detect_stage_from_messages(messages)
        assert stage == "DEACTIVATED"
        assert "Deactivated" in subject

    def test_active_from_earnings(self):
        messages = [
            {"subject": "Your weekly pay is ready", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        stage, subject, date, body_check = detect_stage_from_messages(messages)
        assert stage == "ACTIVE"

    def test_bgc_clear_needs_body_check(self):
        messages = [
            {"subject": "Your background check is complete", "from": "checkr@checkr.com", "date": "2024-01-01"},
        ]
        stage, subject, date, body_check = detect_stage_from_messages(messages)
        assert stage == "BGC_CLEAR"
        assert len(body_check) == 1

    def test_bgc_pending_from_checkr(self):
        messages = [
            {"subject": "Your background check is taking longer than expected", "from": "no-reply@checkr.com", "date": "2024-01-01"},
        ]
        stage, subject, date, body_check = detect_stage_from_messages(messages)
        assert stage == "BGC_PENDING"

    def test_identity_verified(self):
        messages = [
            {"subject": "Your identity has been verified", "from": "checkr@checkr.com", "date": "2024-01-01"},
        ]
        stage, subject, date, body_check = detect_stage_from_messages(messages)
        assert stage == "IDENTITY_VERIFIED"

    def test_registered_no_doordash_emails(self):
        messages = [
            {"subject": "Welcome to Gmail", "from": "google@google.com", "date": "2024-01-01"},
        ]
        stage, subject, date, body_check = detect_stage_from_messages(messages)
        assert stage == "REGISTERED"

    def test_empty_messages(self):
        stage, subject, date, body_check = detect_stage_from_messages([])
        assert stage == "REGISTERED"
        assert subject is None
        assert date is None

    def test_stage_priority_highest_wins(self):
        messages = [
            {"subject": "Your identity has been verified", "from": "checkr@checkr.com", "date": "2024-01-01"},
            {"subject": "Your background check is taking longer", "from": "checkr@checkr.com", "date": "2024-01-02"},
            {"subject": "Your weekly pay is ready", "from": "noreply@doordash.com", "date": "2024-01-03"},
        ]
        stage, subject, date, body_check = detect_stage_from_messages(messages)
        assert stage == "ACTIVE"


class TestDeactivationPatterns:
    """Test expanded deactivation regex patterns."""

    def test_exact_deactivation(self):
        messages = [
            {"subject": "Your Dasher Account Has Been Deactivated", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "DEACTIVATED"

    def test_account_deactivated_variant(self):
        messages = [
            {"subject": "Your account has been deactivated due to policy", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "DEACTIVATED"

    def test_deactivation_confirmed(self):
        messages = [
            {"subject": "Deactivation confirmed for your account", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "DEACTIVATED"

    def test_account_suspended(self):
        messages = [
            {"subject": "Your account has been suspended", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "DEACTIVATED"

    def test_permanently_deactivated(self):
        messages = [
            {"subject": "Your account has been permanently deactivated", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "DEACTIVATED"

    def test_account_is_deactivated(self):
        messages = [
            {"subject": "Your account is now deactivated", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "DEACTIVATED"


class TestReactivation:
    """Test DEACTIVATED -> ACTIVE transition via reactivation."""

    def test_reactivation_overrides_deactivation(self):
        """Newer reactivation email should override older deactivation."""
        messages = [
            {"subject": "Your Dasher Account Has Been Deactivated", "from": "noreply@doordash.com", "date": "2024-01-01"},
            {"subject": "Your account has been reactivated", "from": "noreply@doordash.com", "date": "2024-01-10"},
        ]
        stage, subject, _, _ = detect_stage_from_messages(messages)
        assert stage == "ACTIVE"
        assert "reactivated" in subject.lower()

    def test_welcome_back_reactivation(self):
        messages = [
            {"subject": "Your Dasher Account Has Been Deactivated", "from": "noreply@doordash.com", "date": "2024-01-01"},
            {"subject": "Welcome back to DoorDash!", "from": "noreply@doordash.com", "date": "2024-01-10"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "ACTIVE"

    def test_deactivation_without_reactivation(self):
        """No reactivation = still DEACTIVATED."""
        messages = [
            {"subject": "Your Dasher Account Has Been Deactivated", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "DEACTIVATED"

    def test_reactivation_metadata(self):
        messages = [
            {"subject": "Your Dasher Account Has Been Deactivated", "from": "noreply@doordash.com", "date": "2024-01-01"},
            {"subject": "Your account has been reactivated", "from": "noreply@doordash.com", "date": "2024-01-10"},
        ]
        result = detect_stage_with_metadata(messages)
        assert result["stage"] == "ACTIVE"
        assert result["reactivated"] is True


class TestMultiVendorBGC:
    """Test BGC detection with multiple vendors."""

    def test_checkr_vendor(self):
        assert _is_bgc_vendor("noreply@checkr.com")

    def test_onfido_vendor(self):
        assert _is_bgc_vendor("noreply@onfido.com")

    def test_sterling_vendor(self):
        assert _is_bgc_vendor("bgc@sterling.com")

    def test_accurate_vendor(self):
        assert _is_bgc_vendor("no-reply@accurate.com")

    def test_certn_vendor(self):
        assert _is_bgc_vendor("hello@certn.co")

    def test_unknown_vendor(self):
        assert not _is_bgc_vendor("hr@randomcompany.com")

    def test_onfido_bgc_pending(self):
        messages = [
            {"subject": "Your background check is taking longer", "from": "no-reply@onfido.com", "date": "2024-01-01"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "BGC_PENDING"

    def test_sterling_bgc_pending(self):
        assert _is_bgc_pending_signal("your background check status update", "support@sterling.com")

    def test_non_vendor_bgc_not_pending(self):
        """BGC email from non-vendor should not be detected as pending."""
        assert not _is_bgc_pending_signal("background check is taking longer", "other@example.com")


class TestBGCAbbreviation:
    """Test that 'bgc' is equivalent to 'background check'."""

    def test_bgc_complete_abbreviation(self):
        messages = [
            {"subject": "Your BGC is complete", "from": "checkr@checkr.com", "date": "2024-01-01"},
        ]
        stage, _, _, body_check = detect_stage_from_messages(messages)
        assert stage == "BGC_CLEAR"
        assert len(body_check) == 1

    def test_bgc_pending_abbreviation(self):
        assert _is_bgc_pending_signal("your bgc is taking longer", "no-reply@checkr.com")

    def test_bgc_generic_from_vendor(self):
        assert _is_bgc_pending_signal("update on your bgc", "no-reply@checkr.com")


class TestWhitespaceInsensitive:
    """Test whitespace-insensitive matching."""

    def test_background_check_extra_spaces(self):
        messages = [
            {"subject": "Your background  check is complete", "from": "checkr@checkr.com", "date": "2024-01-01"},
        ]
        stage, _, _, body_check = detect_stage_from_messages(messages)
        assert stage == "BGC_CLEAR"

    def test_dasher_account_extra_spaces(self):
        messages = [
            {"subject": "Your dasher  account  has  been  deactivated", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "DEACTIVATED"

    def test_weekly_pay_extra_spaces(self):
        assert _is_active_signal("your  weekly  pay is ready", "")


class TestCheckBgcBody:
    def test_bgc_clear(self):
        assert check_bgc_body("Your background check is complete. No issues found.") == "BGC_CLEAR"

    def test_bgc_consider_impact(self):
        assert check_bgc_body("could potentially impact your ability") == "BGC_CONSIDER"

    def test_bgc_consider_disqualification(self):
        assert check_bgc_body("This may lead to disqualification from the platform.") == "BGC_CONSIDER"

    def test_bgc_consider_eligibility(self):
        assert check_bgc_body("This finding may affect eligibility for the position.") == "BGC_CONSIDER"

    def test_bgc_consider_adverse_action(self):
        assert check_bgc_body("We are required to take adverse action based on findings.") == "BGC_CONSIDER"

    def test_bgc_consider_requires_review(self):
        assert check_bgc_body("Your report requires further review by our team.") == "BGC_CONSIDER"

    def test_broad_consider_no_longer_triggers(self):
        """The broad 'consider' keyword should no longer trigger BGC_CONSIDER."""
        assert check_bgc_body("We found something to consider in your report") == "BGC_CLEAR"

    def test_bgc_body_with_confidence(self):
        stage, conf = check_bgc_body_with_confidence("could potentially impact your ability")
        assert stage == "BGC_CONSIDER"
        assert conf == "high"

    def test_bgc_body_variant_confidence(self):
        stage, conf = check_bgc_body_with_confidence("This may lead to disqualification.")
        assert stage == "BGC_CONSIDER"
        assert conf == "medium"

    def test_bgc_body_clear_confidence(self):
        stage, conf = check_bgc_body_with_confidence("Everything looks good. No issues.")
        assert stage == "BGC_CLEAR"
        assert conf == "high"


class TestConfidenceScoring:
    """Test confidence level assignment."""

    def test_deactivated_high_confidence(self):
        messages = [
            {"subject": "Your Dasher Account Has Been Deactivated", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        result = detect_stage_with_metadata(messages)
        assert result["stage"] == "DEACTIVATED"
        assert result["confidence"] == "high"

    def test_deactivated_medium_confidence(self):
        messages = [
            {"subject": "Your account has been suspended", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        result = detect_stage_with_metadata(messages)
        assert result["stage"] == "DEACTIVATED"
        assert result["confidence"] == "medium"

    def test_active_high_confidence(self):
        messages = [
            {"subject": "Your weekly pay is ready", "from": "noreply@doordash.com", "date": "2024-01-01"},
        ]
        result = detect_stage_with_metadata(messages)
        assert result["stage"] == "ACTIVE"
        assert result["confidence"] == "high"

    def test_bgc_pending_high_confidence(self):
        messages = [
            {"subject": "Your background check is taking longer", "from": "no-reply@checkr.com", "date": "2024-01-01"},
        ]
        result = detect_stage_with_metadata(messages)
        assert result["stage"] == "BGC_PENDING"
        assert result["confidence"] == "high"

    def test_bgc_pending_low_confidence(self):
        """Generic BGC mention from vendor = low confidence."""
        messages = [
            {"subject": "Update on your background check", "from": "no-reply@checkr.com", "date": "2024-01-01"},
        ]
        result = detect_stage_with_metadata(messages)
        assert result["stage"] == "BGC_PENDING"
        assert result["confidence"] == "low"

    def test_registered_low_confidence(self):
        result = detect_stage_with_metadata([])
        assert result["stage"] == "REGISTERED"
        assert result["confidence"] == "low"


class TestDateSorting:
    """Test that newest emails are processed first."""

    def test_newer_active_overrides_older_pending(self):
        """Newest email should be processed first; ACTIVE > BGC_PENDING by priority."""
        messages = [
            {"subject": "Your background check is taking longer", "from": "no-reply@checkr.com", "date": "2024-01-01"},
            {"subject": "Your weekly pay is ready", "from": "noreply@doordash.com", "date": "2024-01-10"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "ACTIVE"

    def test_handles_missing_dates(self):
        """Messages without dates should still be processed."""
        messages = [
            {"subject": "Your weekly pay is ready", "from": "noreply@doordash.com"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "ACTIVE"

    def test_handles_iso_dates(self):
        messages = [
            {"subject": "Your identity has been verified", "from": "checkr@checkr.com", "date": "2024-01-01T10:00:00"},
            {"subject": "Your weekly pay is ready", "from": "noreply@doordash.com", "date": "2024-01-10T12:00:00"},
        ]
        stage, _, _, _ = detect_stage_from_messages(messages)
        assert stage == "ACTIVE"


class TestActiveSignal:
    def test_weekly_pay(self):
        assert _is_active_signal("your weekly pay is ready", "")

    def test_earnings(self):
        assert _is_active_signal("your earnings this week", "")

    def test_not_active(self):
        assert not _is_active_signal("welcome to doordash", "")


class TestBgcPendingSignal:
    def test_checkr_taking_longer(self):
        assert _is_bgc_pending_signal("background check is taking longer", "checkr@checkr.com")

    def test_not_from_checkr(self):
        assert not _is_bgc_pending_signal("background check is taking longer", "other@example.com")


class TestIdentityVerifiedSignal:
    def test_identity_verified(self):
        assert _is_identity_verified_signal("your identity has been verified", "")

    def test_information_verified(self):
        assert _is_identity_verified_signal("your information verified successfully", "")
