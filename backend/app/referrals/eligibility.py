"""Eligibility checks applied when a code is written onto a transaction (§3.4).

Pure decision logic — the service fetches the facts (DB lookups) and passes them
here. Keeping this side-effect-free makes the launch-vs-steady-state rules
(§9) trivially testable.

The first check — the first-transaction window — is the technical face of the
One Inviolable Rule (§1): a code may never be attached to a completed
transaction. It is ENFORCED always and is not relaxable.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EligibilityFacts:
    # Structural
    is_off_campus: bool             # launch scope — student accommodation only
    transaction_completed: bool     # the first-transaction window (§3.4)
    # Code
    code_exists: bool
    code_active: bool
    is_self_referral: bool
    referrals_this_semester: int
    per_code_cap: int
    # Launch toggle (§9.1)
    first_time_purchaser_required: bool
    payer_has_prior_transaction: bool


# Stable reason codes — surfaced to the UI and logged. Ordered by precedence.
REASON_MESSAGES: dict[str, str] = {
    "transaction_completed": "This transaction is already complete — a code can no longer be applied.",
    "not_off_campus": "Referral codes apply to student accommodation bookings.",
    "code_not_found": "That referral code was not found.",
    "code_inactive": "That referral code is no longer active.",
    "self_referral": "You cannot use your own referral code.",
    "code_cap_reached": "This code has reached its limit for the semester.",
    "not_first_time_purchaser": "Referral codes are for first-time bookings.",
}


def check_eligibility(facts: EligibilityFacts) -> tuple[bool, str | None]:
    """Return (eligible, reason_code). reason_code is None when eligible."""
    # The inviolable rule first — never attach to a completed transaction.
    if facts.transaction_completed:
        return False, "transaction_completed"
    if not facts.is_off_campus:
        return False, "not_off_campus"
    if not facts.code_exists:
        return False, "code_not_found"
    if not facts.code_active:
        return False, "code_inactive"
    if facts.is_self_referral:
        return False, "self_referral"
    if facts.referrals_this_semester >= facts.per_code_cap:
        return False, "code_cap_reached"
    if facts.first_time_purchaser_required and facts.payer_has_prior_transaction:
        return False, "not_first_time_purchaser"
    return True, None
