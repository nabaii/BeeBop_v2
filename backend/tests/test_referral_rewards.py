"""Reward maths — table-driven, mirrors test_fees.py."""

from __future__ import annotations

import pytest

from app.referrals.rewards import (
    partner_referrer_share,
    reward_pool,
    split_rewards,
)

# Launch defaults (fractions): pool 3.5%, payer 60% / referrer 40%.
POOL_PCT = 0.035
REFERRER_SHARE = 0.40


def test_reward_pool_basic() -> None:
    # ₦1,000,000 * 3.5% = ₦35,000
    assert reward_pool(1_000_000, POOL_PCT) == 35_000.0


def test_split_follows_configured_percentages_not_rounded_example() -> None:
    split = split_rewards(
        transaction_value=1_000_000,
        reward_pool_pct=POOL_PCT,
        referrer_share_of_pool=REFERRER_SHARE,
    )
    assert split.pool == 35_000.0
    # 60/40 of a 35,000 pool — not the spec's rounded 20k/15k example.
    assert split.referrer_earning == 14_000.0
    assert split.payer_cashback == 21_000.0


def test_split_sides_sum_to_pool_exactly() -> None:
    # An awkward value that would otherwise leak a kobo through rounding.
    split = split_rewards(
        transaction_value=333_333,
        reward_pool_pct=POOL_PCT,
        referrer_share_of_pool=REFERRER_SHARE,
    )
    assert round(split.payer_cashback + split.referrer_earning, 2) == split.pool


def test_payer_is_the_larger_share_under_standard_split() -> None:
    split = split_rewards(
        transaction_value=500_000,
        reward_pool_pct=POOL_PCT,
        referrer_share_of_pool=REFERRER_SHARE,
    )
    assert split.payer_cashback > split.referrer_earning


@pytest.mark.parametrize("bad_value", [0, -1, -0.5])
def test_non_positive_transaction_rejected(bad_value: float) -> None:
    with pytest.raises(ValueError):
        reward_pool(bad_value, POOL_PCT)


@pytest.mark.parametrize("bad_share", [-0.01, 1.01, 2.0])
def test_out_of_range_share_rejected(bad_share: float) -> None:
    with pytest.raises(ValueError):
        split_rewards(
            transaction_value=100_000,
            reward_pool_pct=POOL_PCT,
            referrer_share_of_pool=bad_share,
        )


@pytest.mark.parametrize(
    ("count", "expected"),
    [
        (0, 0.50),   # below first boundary still tier 1
        (1, 0.50),
        (3, 0.50),   # inclusive upper edge of tier 1
        (4, 0.55),   # tier 2 lower edge
        (7, 0.55),   # inclusive upper edge of tier 2
        (8, 0.60),   # tier 3
        (50, 0.60),
    ],
)
def test_partner_tier_ladder(count: int, expected: float) -> None:
    share = partner_referrer_share(
        cleared_referrals_this_semester=count,
        tier1_share=0.50,
        tier2_share=0.55,
        tier3_share=0.60,
        tier1_max=3,
        tier2_max=7,
    )
    assert share == expected


def test_partner_tier_negative_count_rejected() -> None:
    with pytest.raises(ValueError):
        partner_referrer_share(
            cleared_referrals_this_semester=-1,
            tier1_share=0.50,
            tier2_share=0.55,
            tier3_share=0.60,
        )
