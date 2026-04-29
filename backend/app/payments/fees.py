"""Fee calculation — single source of truth, per dev plan §4.

All functions return plain floats in Naira. Every tier boundary has a test in
`tests/test_fees.py`. Agreement generation and invoice creation (Sprint 10)
call directly into these helpers.

All listings are free to upload in Sprint 2 — fees are computed and charged
only on a completed transaction. Landlords see their expected fee in the
dashboard before committing; this module provides that calculation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# Thresholds
RENT_TIER_THRESHOLD_NAIRA = 5_000_000
SALES_TIER_THRESHOLD_NAIRA = 50_000_000
SHORT_LET_TIER_THRESHOLD_NAIRA = 150_000

# Rent — flat fee (landlord and seeker share)
RENT_FLAT_LANDLORD = 15_000
RENT_FLAT_SEEKER = 5_000
RENT_FLAT_TOTAL = RENT_FLAT_LANDLORD + RENT_FLAT_SEEKER      # 20k

# Rent percentages by tier
RENT_STANDARD_TOTAL_PCT = 0.03        # 2% landlord + 1% seeker (tier <= 5m)
RENT_PREMIUM_TOTAL_PCT = 0.02         # ~1.34% landlord + ~0.66% seeker (> 5m)

# Short-let
SHORT_LET_HOST_PCT = 0.03             # always 3%
SHORT_LET_SEEKER_STANDARD_PCT = 0.10  # up to 150k
SHORT_LET_SEEKER_PREMIUM_PCT = 0.08   # above 150k

# Sales
SALES_STANDARD_PCT = 0.03             # up to 50m
SALES_PREMIUM_PCT = 0.025             # above 50m

# Student accommodation
STUDENT_OWNER_PCT = 0.025
STUDENT_SEEKER_PCT = 0.03

# Renewal (rent)
RENT_RENEWAL_FLAT = 10_000


@dataclass(frozen=True)
class RentFeeBreakdown:
    tier: Literal["standard", "premium"]
    landlord_flat: float
    landlord_pct_component: float
    seeker_flat: float
    seeker_pct_component: float
    total: float


@dataclass(frozen=True)
class ShortLetFeeBreakdown:
    tier: Literal["standard", "premium"]
    host_fee: float
    seeker_fee: float
    host_payout: float      # gross booking minus host fee
    grand_total_seeker_pays: float


@dataclass(frozen=True)
class SalesFeeBreakdown:
    tier: Literal["standard", "premium"]
    seller_fee: float
    buyer_fee: float        # always 0


@dataclass(frozen=True)
class StudentFeeBreakdown:
    owner_fee: float
    seeker_fee: float


def _round2(value: float) -> float:
    return round(value + 1e-9, 2)


def rent_fee(annual_rent: float) -> RentFeeBreakdown:
    """Flat 15k+5k split plus a percentage component.

    Standard tier (<= 5m): 2% landlord + 1% seeker → 3% total
    Premium  tier (>  5m): ~1.34% landlord + ~0.66% seeker → 2% total
    """
    if annual_rent <= 0:
        raise ValueError("annual_rent must be positive")
    is_standard = annual_rent <= RENT_TIER_THRESHOLD_NAIRA
    tier: Literal["standard", "premium"] = "standard" if is_standard else "premium"

    if is_standard:
        landlord_pct = annual_rent * 0.02
        seeker_pct = annual_rent * 0.01
    else:
        # Keep the documented ~2:1 ratio of the premium 2%: 4/3 landlord + 2/3 seeker.
        landlord_pct = annual_rent * (2.0 / 3.0) * 0.02
        seeker_pct = annual_rent * (1.0 / 3.0) * 0.02

    total = RENT_FLAT_TOTAL + landlord_pct + seeker_pct
    return RentFeeBreakdown(
        tier=tier,
        landlord_flat=RENT_FLAT_LANDLORD,
        landlord_pct_component=_round2(landlord_pct),
        seeker_flat=RENT_FLAT_SEEKER,
        seeker_pct_component=_round2(seeker_pct),
        total=_round2(total),
    )


def short_let_fee(booking_value: float) -> ShortLetFeeBreakdown:
    """Booking value is total stay (nightly rate x nights), not per-night."""
    if booking_value <= 0:
        raise ValueError("booking_value must be positive")
    is_standard = booking_value <= SHORT_LET_TIER_THRESHOLD_NAIRA
    seeker_pct = SHORT_LET_SEEKER_STANDARD_PCT if is_standard else SHORT_LET_SEEKER_PREMIUM_PCT
    host_fee = booking_value * SHORT_LET_HOST_PCT
    seeker_fee = booking_value * seeker_pct
    return ShortLetFeeBreakdown(
        tier="standard" if is_standard else "premium",
        host_fee=_round2(host_fee),
        seeker_fee=_round2(seeker_fee),
        host_payout=_round2(booking_value - host_fee),
        grand_total_seeker_pays=_round2(booking_value + seeker_fee),
    )


def sales_fee(sale_value: float) -> SalesFeeBreakdown:
    """Seller pays everything. Buyer pays zero platform fee."""
    if sale_value <= 0:
        raise ValueError("sale_value must be positive")
    is_standard = sale_value <= SALES_TIER_THRESHOLD_NAIRA
    pct = SALES_STANDARD_PCT if is_standard else SALES_PREMIUM_PCT
    return SalesFeeBreakdown(
        tier="standard" if is_standard else "premium",
        seller_fee=_round2(sale_value * pct),
        buyer_fee=0.0,
    )


def student_accommodation_fee(accommodation_price: float) -> StudentFeeBreakdown:
    """Independent charges — not pooled or split per product brief §11.2."""
    if accommodation_price <= 0:
        raise ValueError("accommodation_price must be positive")
    return StudentFeeBreakdown(
        owner_fee=_round2(accommodation_price * STUDENT_OWNER_PCT),
        seeker_fee=_round2(accommodation_price * STUDENT_SEEKER_PCT),
    )
