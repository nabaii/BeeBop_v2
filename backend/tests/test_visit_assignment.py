"""Visit assignment invariants — confirmation window + role separation."""

from __future__ import annotations

from datetime import timedelta

from app.visits.service import AGENT_CONFIRMATION_WINDOW


def test_agent_confirmation_window_is_two_hours() -> None:
    # Per dev plan §13.1.
    assert AGENT_CONFIRMATION_WINDOW == timedelta(hours=2)


def test_confirmation_window_seconds() -> None:
    assert AGENT_CONFIRMATION_WINDOW.total_seconds() == 7200
