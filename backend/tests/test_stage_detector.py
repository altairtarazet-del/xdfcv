"""Tests for stage_detector module."""
import pytest
from app.services.stage_detector import (
    detect_stage_from_messages,
    check_bgc_body,
    _is_active_signal,
    _is_bgc_pending_signal,
    _is_identity_verified_signal,
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


class TestCheckBgcBody:
    def test_bgc_clear(self):
        assert check_bgc_body("Your background check is complete. No issues found.") == "BGC_CLEAR"

    def test_bgc_consider_impact(self):
        assert check_bgc_body("could potentially impact your ability") == "BGC_CONSIDER"

    def test_bgc_consider_keyword(self):
        assert check_bgc_body("We found something to consider in your report") == "BGC_CONSIDER"


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
