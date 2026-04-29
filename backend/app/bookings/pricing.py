"""Short-let booking pricing — pure functions over the listing's type_data.

Total stay = sum over nights of (weekend_rate if Fri/Sat else base_rate). The
seeker fee tier is calculated against the total stay value (not per night)
per dev plan §4.3.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from app.payments.fees import short_let_fee


@dataclass(frozen=True)
class StayPrice:
    nights: int
    base_total: float
    weekend_uplift: float
    weekend_nights: int


def stay_price(
    *, check_in: date, check_out: date, base_rate: float, weekend_rate: float | None
) -> StayPrice:
    if check_out <= check_in:
        raise ValueError("check_out must be after check_in.")
    nights = (check_out - check_in).days
    weekend_nights = 0
    base_total = 0.0
    weekend_uplift = 0.0
    cursor = check_in
    for _ in range(nights):
        is_weekend = cursor.weekday() in (4, 5)   # Fri, Sat — Nigerian short-let convention
        if is_weekend and weekend_rate is not None:
            base_total += weekend_rate
            weekend_uplift += max(0.0, weekend_rate - base_rate)
            weekend_nights += 1
        else:
            base_total += base_rate
        cursor = cursor + timedelta(days=1)
    return StayPrice(
        nights=nights,
        base_total=round(base_total, 2),
        weekend_uplift=round(weekend_uplift, 2),
        weekend_nights=weekend_nights,
    )


@dataclass(frozen=True)
class BookingQuoteCalc:
    nights: int
    base_total: float
    weekend_uplift: float
    seeker_fee: float
    host_fee: float
    grand_total: float
    host_payout: float


def calculate_quote(
    *, check_in: date, check_out: date, base_rate: float, weekend_rate: float | None
) -> BookingQuoteCalc:
    stay = stay_price(
        check_in=check_in,
        check_out=check_out,
        base_rate=base_rate,
        weekend_rate=weekend_rate,
    )
    fees = short_let_fee(stay.base_total)
    grand_total = round(stay.base_total + fees.seeker_fee, 2)
    return BookingQuoteCalc(
        nights=stay.nights,
        base_total=stay.base_total,
        weekend_uplift=stay.weekend_uplift,
        seeker_fee=float(fees.seeker_fee),
        host_fee=float(fees.host_fee),
        grand_total=grand_total,
        host_payout=float(fees.host_payout),
    )
