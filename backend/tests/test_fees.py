"""Fee calculation — every tier boundary covered per dev plan §11.1."""

from __future__ import annotations

import pytest

from app.payments.fees import (
    RENT_FLAT_LANDLORD,
    RENT_FLAT_SEEKER,
    RENT_TIER_THRESHOLD_NAIRA,
    SALES_TIER_THRESHOLD_NAIRA,
    SHORT_LET_TIER_THRESHOLD_NAIRA,
    rent_fee,
    sales_fee,
    short_let_fee,
    student_accommodation_fee,
)


# -----------------------------------------------------------------------------
# Rent
# -----------------------------------------------------------------------------


def test_rent_at_tier_threshold_is_standard() -> None:
    fees = rent_fee(RENT_TIER_THRESHOLD_NAIRA)
    assert fees.tier == "standard"
    assert fees.landlord_flat == RENT_FLAT_LANDLORD
    assert fees.seeker_flat == RENT_FLAT_SEEKER
    assert fees.landlord_pct_component == pytest.approx(RENT_TIER_THRESHOLD_NAIRA * 0.02)
    assert fees.seeker_pct_component == pytest.approx(RENT_TIER_THRESHOLD_NAIRA * 0.01)
    # 20k flat + 3% of rent.
    assert fees.total == pytest.approx(20_000 + RENT_TIER_THRESHOLD_NAIRA * 0.03)


def test_rent_just_above_threshold_flips_premium() -> None:
    fees = rent_fee(RENT_TIER_THRESHOLD_NAIRA + 1)
    assert fees.tier == "premium"


def test_rent_premium_2pct_total_pct() -> None:
    fees = rent_fee(10_000_000)
    assert fees.tier == "premium"
    # Percentage total should equal 2% (landlord 4/3 * 0.02 + seeker 2/3 * 0.02).
    pct_total = fees.landlord_pct_component + fees.seeker_pct_component
    assert pct_total == pytest.approx(10_000_000 * 0.02)


def test_rent_premium_2_to_1_ratio() -> None:
    fees = rent_fee(12_000_000)
    # 2:1 landlord-to-seeker split on the percentage component.
    ratio = fees.landlord_pct_component / fees.seeker_pct_component
    assert ratio == pytest.approx(2.0, rel=1e-3)


def test_rent_negative_or_zero_raises() -> None:
    with pytest.raises(ValueError):
        rent_fee(0)
    with pytest.raises(ValueError):
        rent_fee(-1)


# -----------------------------------------------------------------------------
# Short-let
# -----------------------------------------------------------------------------


def test_short_let_at_threshold_is_standard() -> None:
    fees = short_let_fee(SHORT_LET_TIER_THRESHOLD_NAIRA)
    assert fees.tier == "standard"
    assert fees.host_fee == pytest.approx(150_000 * 0.03)
    assert fees.seeker_fee == pytest.approx(150_000 * 0.10)
    assert fees.host_payout == pytest.approx(150_000 - 150_000 * 0.03)
    assert fees.grand_total_seeker_pays == pytest.approx(150_000 + 150_000 * 0.10)


def test_short_let_just_above_threshold_is_premium() -> None:
    fees = short_let_fee(SHORT_LET_TIER_THRESHOLD_NAIRA + 1)
    assert fees.tier == "premium"


def test_short_let_premium_seeker_rate_drops_to_8pct() -> None:
    fees = short_let_fee(500_000)
    assert fees.tier == "premium"
    assert fees.host_fee == pytest.approx(15_000)
    assert fees.seeker_fee == pytest.approx(40_000)
    assert fees.host_payout == pytest.approx(485_000)


def test_short_let_booking_value_is_total_not_nightly() -> None:
    # Regression: dev plan §4.3 explicitly warns against per-night interpretation.
    # 40_000 nightly * 4 nights = 160_000 (just above standard tier).
    fees = short_let_fee(160_000)
    assert fees.tier == "premium"


# -----------------------------------------------------------------------------
# Sales
# -----------------------------------------------------------------------------


def test_sales_at_threshold_is_standard() -> None:
    fees = sales_fee(SALES_TIER_THRESHOLD_NAIRA)
    assert fees.tier == "standard"
    assert fees.seller_fee == pytest.approx(SALES_TIER_THRESHOLD_NAIRA * 0.03)
    assert fees.buyer_fee == 0.0


def test_sales_just_above_threshold_is_premium() -> None:
    fees = sales_fee(SALES_TIER_THRESHOLD_NAIRA + 1)
    assert fees.tier == "premium"


def test_sales_premium_rate_is_2_5pct() -> None:
    fees = sales_fee(100_000_000)
    assert fees.tier == "premium"
    assert fees.seller_fee == pytest.approx(2_500_000)
    assert fees.buyer_fee == 0.0


# -----------------------------------------------------------------------------
# Student accommodation
# -----------------------------------------------------------------------------


def test_student_charges_are_independent() -> None:
    fees = student_accommodation_fee(500_000)
    # 2.5% owner + 3% seeker, each charged independently (not pooled).
    assert fees.owner_fee == pytest.approx(12_500)
    assert fees.seeker_fee == pytest.approx(15_000)


def test_student_rejects_zero_or_negative() -> None:
    with pytest.raises(ValueError):
        student_accommodation_fee(0)
