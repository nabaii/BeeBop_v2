"""Referral reward maths — pure functions, no I/O. Mirrors `app/payments/fees.py`.

Conventions:
  • Percentages are fractions (0.035 == 3.5%).
  • Money values are Naira floats, rounded to 2dp the same way `fees.py` does.
  • The reward pool is a slice of the transaction value, funded from Beebop's
    take (§4). The split sends the larger share to the payer as cashback and the
    rest to the referrer — unless the code is a campus partner, whose referrer
    share escalates with cleared referrals (§4.3).

Note on the spec's worked example: §4.2 shows ₦20,000 / ₦15,000 on a ₦1,000,000
transaction, but the stated 60/40 split of a ₦35,000 pool is ₦21,000 / ₦14,000.
The example is rounded; we compute from the configured percentages, which are
admin-tunable. Confirm the exact split with product before go-live.
"""

from __future__ import annotations

from dataclasses import dataclass


def _round2(value: float) -> float:
    return round(value + 1e-9, 2)


@dataclass(frozen=True)
class RewardSplit:
    pool: float
    payer_cashback: float       # the larger share, to the booking student
    referrer_earning: float     # to the code owner


def reward_pool(transaction_value: float, reward_pool_pct: float) -> float:
    """The total reward pool for a transaction — a fraction of its value."""
    if transaction_value <= 0:
        raise ValueError("transaction_value must be positive")
    if not 0.0 <= reward_pool_pct <= 1.0:
        raise ValueError("reward_pool_pct must be a fraction between 0 and 1")
    return _round2(transaction_value * reward_pool_pct)


def split_rewards(
    *,
    transaction_value: float,
    reward_pool_pct: float,
    referrer_share_of_pool: float,
) -> RewardSplit:
    """Divide the pool between referrer and payer.

    The referrer takes `referrer_share_of_pool`; the payer takes the remainder
    as cashback. The payer is computed as the residual so the two sides always
    sum to exactly the pool (no rounding leak).
    """
    if not 0.0 <= referrer_share_of_pool <= 1.0:
        raise ValueError("referrer_share_of_pool must be a fraction between 0 and 1")
    pool = reward_pool(transaction_value, reward_pool_pct)
    referrer = _round2(pool * referrer_share_of_pool)
    payer = _round2(pool - referrer)
    return RewardSplit(pool=pool, payer_cashback=payer, referrer_earning=referrer)


def partner_referrer_share(
    *,
    cleared_referrals_this_semester: int,
    tier1_share: float,
    tier2_share: float,
    tier3_share: float,
    tier1_max: int = 3,
    tier2_max: int = 7,
) -> float:
    """Resolve a campus partner's referrer share from the tier ladder (§4.3).

    Boundaries are inclusive: tier 1 covers 1..tier1_max, tier 2 covers
    (tier1_max+1)..tier2_max, tier 3 covers everything above. Evaluated at the
    time each earning is created, against the count of cleared/eligible
    referrals in the current semester window.
    """
    if cleared_referrals_this_semester < 0:
        raise ValueError("cleared_referrals_this_semester must be >= 0")
    if cleared_referrals_this_semester <= tier1_max:
        return tier1_share
    if cleared_referrals_this_semester <= tier2_max:
        return tier2_share
    return tier3_share


def resolve_referrer_share(
    *,
    is_partner: bool,
    cleared_referrals_this_semester: int,
    standard_share: float,
    tier1_share: float,
    tier2_share: float,
    tier3_share: float,
    tier1_max: int = 3,
    tier2_max: int = 7,
) -> float:
    """The referrer's share of the pool for one earning.

    Standard codes use the flat configured share; partner codes escalate up the
    tier ladder by their cleared referrals this semester (§4.3).
    """
    if not is_partner:
        return standard_share
    return partner_referrer_share(
        cleared_referrals_this_semester=cleared_referrals_this_semester,
        tier1_share=tier1_share,
        tier2_share=tier2_share,
        tier3_share=tier3_share,
        tier1_max=tier1_max,
        tier2_max=tier2_max,
    )
