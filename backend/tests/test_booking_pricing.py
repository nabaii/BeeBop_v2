"""Booking pricing — base + weekend uplift + tiered seeker fee."""

from __future__ import annotations

from datetime import date

from app.bookings.pricing import calculate_quote, stay_price


def test_stay_price_three_weekday_nights() -> None:
    # 2026-04-27 is a Monday — Mon, Tue, Wed = 3 weekday nights.
    s = stay_price(
        check_in=date(2026, 4, 27),
        check_out=date(2026, 4, 30),
        base_rate=30000.0,
        weekend_rate=45000.0,
    )
    assert s.nights == 3
    assert s.base_total == 90000.0
    assert s.weekend_uplift == 0.0
    assert s.weekend_nights == 0


def test_stay_price_includes_friday_and_saturday_uplift() -> None:
    # 2026-05-01 is a Friday — Fri + Sat (weekend) + Sun (base).
    s = stay_price(
        check_in=date(2026, 5, 1),
        check_out=date(2026, 5, 4),
        base_rate=30000.0,
        weekend_rate=45000.0,
    )
    assert s.nights == 3
    assert s.weekend_nights == 2
    assert s.base_total == 45000.0 + 45000.0 + 30000.0
    assert s.weekend_uplift == 2 * (45000.0 - 30000.0)


def test_quote_uses_short_let_premium_seeker_fee_above_threshold() -> None:
    # Above 150,000 → seeker fee = 8%.
    quote = calculate_quote(
        check_in=date(2026, 5, 4),     # Mon
        check_out=date(2026, 5, 11),   # Mon (7 nights)
        base_rate=30000.0,
        weekend_rate=None,
    )
    assert quote.nights == 7
    assert quote.base_total == 210000.0
    # 8% of 210,000 = 16,800 (premium tier).
    assert abs(quote.seeker_fee - 16800.0) < 0.01
    assert quote.host_fee == 0.03 * quote.base_total
    assert quote.host_payout == quote.base_total - quote.host_fee
    assert quote.grand_total == round(quote.base_total + quote.seeker_fee, 2)


def test_quote_standard_seeker_fee_at_threshold() -> None:
    quote = calculate_quote(
        check_in=date(2026, 5, 4),
        check_out=date(2026, 5, 9),   # 5 weekday nights
        base_rate=30000.0,
        weekend_rate=None,
    )
    # 5 × 30,000 = 150,000 → standard tier (10% seeker fee).
    assert quote.base_total == 150000.0
    assert abs(quote.seeker_fee - 15000.0) < 0.01


def test_quote_no_weekend_rate_uses_base() -> None:
    quote = calculate_quote(
        check_in=date(2026, 5, 1),    # Fri
        check_out=date(2026, 5, 4),
        base_rate=30000.0,
        weekend_rate=None,
    )
    assert quote.weekend_uplift == 0
    assert quote.base_total == 3 * 30000.0
