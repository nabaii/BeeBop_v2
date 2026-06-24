"""Eligibility decision table (§3.4, §9). Pure — no DB."""

from __future__ import annotations

import dataclasses

import pytest

from app.referrals.eligibility import EligibilityFacts, check_eligibility

# A fully-eligible baseline (relaxed launch config). Each test perturbs one axis.
_OK = EligibilityFacts(
    is_off_campus=True,
    transaction_completed=False,
    code_exists=True,
    code_active=True,
    is_self_referral=False,
    referrals_this_semester=3,
    per_code_cap=25,
    first_time_purchaser_required=False,
    payer_has_prior_transaction=True,  # irrelevant while the toggle is off
)


def _with(**changes: object) -> EligibilityFacts:
    return dataclasses.replace(_OK, **changes)


def test_baseline_is_eligible() -> None:
    ok, reason = check_eligibility(_OK)
    assert ok is True
    assert reason is None


def test_completed_transaction_blocks_even_when_everything_else_is_fine() -> None:
    # The inviolable rule — and it wins over every other reason.
    ok, reason = check_eligibility(
        _with(transaction_completed=True, code_exists=False, is_self_referral=True)
    )
    assert ok is False
    assert reason == "transaction_completed"


def test_non_off_campus_blocked() -> None:
    ok, reason = check_eligibility(_with(is_off_campus=False))
    assert (ok, reason) == (False, "not_off_campus")


def test_missing_code_blocked() -> None:
    assert check_eligibility(_with(code_exists=False)) == (False, "code_not_found")


def test_inactive_code_blocked() -> None:
    assert check_eligibility(_with(code_active=False)) == (False, "code_inactive")


def test_self_referral_blocked() -> None:
    assert check_eligibility(_with(is_self_referral=True)) == (False, "self_referral")


def test_cap_reached_blocked_at_boundary() -> None:
    assert check_eligibility(_with(referrals_this_semester=25, per_code_cap=25)) == (
        False,
        "code_cap_reached",
    )


def test_under_cap_allowed_at_boundary_minus_one() -> None:
    ok, reason = check_eligibility(_with(referrals_this_semester=24, per_code_cap=25))
    assert ok is True


def test_first_time_purchaser_relaxed_at_launch_allows_repeat_buyer() -> None:
    ok, _ = check_eligibility(
        _with(first_time_purchaser_required=False, payer_has_prior_transaction=True)
    )
    assert ok is True


def test_first_time_purchaser_enforced_blocks_repeat_buyer() -> None:
    assert check_eligibility(
        _with(first_time_purchaser_required=True, payer_has_prior_transaction=True)
    ) == (False, "not_first_time_purchaser")


def test_first_time_purchaser_enforced_allows_genuine_first_timer() -> None:
    ok, _ = check_eligibility(
        _with(first_time_purchaser_required=True, payer_has_prior_transaction=False)
    )
    assert ok is True


@pytest.mark.parametrize("reason", ["transaction_completed", "self_referral", "code_cap_reached"])
def test_every_reason_has_a_user_message(reason: str) -> None:
    from app.referrals.eligibility import REASON_MESSAGES

    assert reason in REASON_MESSAGES and REASON_MESSAGES[reason]
