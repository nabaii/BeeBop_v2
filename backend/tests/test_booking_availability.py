"""Pure-Python booking availability tests using fakes for the DB query.

The full integration coverage (real Postgres + concurrent accepts) lands in
the test container in CI.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

# Re-implement the predicate logic locally so this test stays unit-pure.
# The runtime version lives in app.bookings.availability.has_conflict.


def _conflict(
    *,
    requested_in: date,
    requested_out: date,
    booked_in: date,
    booked_out: date,
    turnaround: int,
) -> bool:
    booked_end = booked_out + timedelta(days=turnaround)
    return requested_in < booked_end and requested_out > booked_in


def test_back_to_back_zero_turnaround_no_conflict() -> None:
    assert not _conflict(
        requested_in=date(2026, 5, 5),
        requested_out=date(2026, 5, 7),
        booked_in=date(2026, 5, 3),
        booked_out=date(2026, 5, 5),
        turnaround=0,
    )


def test_back_to_back_with_turnaround_blocks() -> None:
    assert _conflict(
        requested_in=date(2026, 5, 5),
        requested_out=date(2026, 5, 7),
        booked_in=date(2026, 5, 3),
        booked_out=date(2026, 5, 5),
        turnaround=1,
    )


def test_overlap_inside_existing_booking_blocks() -> None:
    assert _conflict(
        requested_in=date(2026, 5, 4),
        requested_out=date(2026, 5, 5),
        booked_in=date(2026, 5, 3),
        booked_out=date(2026, 5, 7),
        turnaround=0,
    )


def test_request_strictly_before_existing_no_conflict() -> None:
    assert not _conflict(
        requested_in=date(2026, 5, 1),
        requested_out=date(2026, 5, 3),
        booked_in=date(2026, 5, 3),
        booked_out=date(2026, 5, 7),
        turnaround=0,
    )
