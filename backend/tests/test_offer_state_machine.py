"""Pure-Python coverage of the offer state-machine invariants.

Database-backed coverage (full submit → counter → accept → visit-creation
chain) lands with the Postgres test container in CI.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.offer import MAX_OFFER_ROUNDS
from app.offers.service import OFFER_RESPONSE_WINDOW


def test_max_rounds_is_three() -> None:
    # Per dev plan §8.3 — locking this at the constant level guards against
    # accidental loosening in a future refactor.
    assert MAX_OFFER_ROUNDS == 3


def test_response_window_is_48_hours() -> None:
    assert OFFER_RESPONSE_WINDOW == timedelta(hours=48)


def test_response_window_total_seconds_matches_48h() -> None:
    assert OFFER_RESPONSE_WINDOW.total_seconds() == 48 * 60 * 60


def test_expiry_is_48h_after_creation() -> None:
    now = datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc)
    expires_at = now + OFFER_RESPONSE_WINDOW
    assert expires_at == datetime(2026, 5, 3, 12, 0, tzinfo=timezone.utc)
