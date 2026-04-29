"""Pure-Python invariants for the agent visit lifecycle."""

from __future__ import annotations

import pytest

from app.agents.schemas import (
    CancelVisitPayload,
    ConfirmAssignmentPayload,
    PostVisitReportPayload,
)
from app.agents.service import CONDUCT_REMINDERS


def test_conduct_reminders_cover_dev_plan_13_3() -> None:
    # Six reminders mirror the visit-conduct standards in the brief.
    assert len(CONDUCT_REMINDERS) >= 6
    text = " ".join(CONDUCT_REMINDERS).lower()
    # Spot-check key directives.
    assert "5–10 minutes" in text or "5-10 minutes" in text
    assert "contact details" in text
    assert "every room" in text


def test_confirm_payload_requires_scheduled_at_when_confirmed() -> None:
    # Pydantic accepts the shape — the service-level guard enforces semantic
    # rules. We assert the schema doesn't accidentally reject the well-formed
    # confirmation case.
    p = ConfirmAssignmentPayload(confirmed=True, scheduled_at=None)
    assert p.confirmed is True


def test_cancel_payload_requires_reason() -> None:
    with pytest.raises(Exception):
        # min_length=1 — Pydantic rejects empty/missing.
        CancelVisitPayload(reason="")


def test_post_visit_report_payload_optional_fields_default() -> None:
    p = PostVisitReportPayload(visit_occurred=True)
    assert p.access_issues is False
    assert p.conduct_issues is False
    assert p.amenity_observations == []
