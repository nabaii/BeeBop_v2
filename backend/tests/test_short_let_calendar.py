"""Short-let calendar day-state generation."""

from __future__ import annotations

from datetime import date

from app.dashboards.service import _calendar_days


def test_returns_correct_number_of_days() -> None:
    days = _calendar_days(today=date(2026, 5, 1), days=14, td={"base_rate": 30000})
    assert len(days) == 14


def test_dates_are_sequential_starting_from_today() -> None:
    days = _calendar_days(today=date(2026, 5, 1), days=3, td={"base_rate": 30000})
    assert [d.date for d in days] == [date(2026, 5, 1), date(2026, 5, 2), date(2026, 5, 3)]


def test_weekend_uplift_applied_on_friday_and_saturday() -> None:
    # 2026-05-01 is a Friday — should get the weekend rate.
    days = _calendar_days(
        today=date(2026, 5, 1),
        days=3,
        td={"base_rate": 30000, "weekend_rate": 45000},
    )
    assert days[0].rate == 45000.0    # Fri
    assert days[1].rate == 45000.0    # Sat
    assert days[2].rate == 30000.0    # Sun (back to base)


def test_no_weekend_rate_falls_back_to_base() -> None:
    days = _calendar_days(today=date(2026, 5, 1), days=3, td={"base_rate": 30000})
    assert all(d.rate == 30000.0 for d in days)


def test_all_days_available_in_sprint5_scope() -> None:
    # Booked + turnaround states arrive with the Booking table in Sprint 11.
    days = _calendar_days(today=date(2026, 5, 1), days=14, td={"base_rate": 30000})
    assert {d.state for d in days} == {"available"}


def test_is_weekend_flag_only_for_friday_and_saturday() -> None:
    days = _calendar_days(today=date(2026, 4, 27), days=7, td={"base_rate": 30000})
    # 27 Apr 2026 is a Monday.
    flags = [d.is_weekend for d in days]
    assert flags == [False, False, False, False, True, True, False]
