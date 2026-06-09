"""Valuation report storage and area-score helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.verification.reports import (
    CachedValuationReport,
    ValuationReportPayload,
    clear_stored_report,
    public_area_score_payload,
    read_stored_report,
)


def test_public_area_score_payload_serialises_scores_and_timestamp() -> None:
    area_score = SimpleNamespace(
        road_condition=4,
        electricity_supply_hours=3,
        security=5,
        proximity=2,
        last_assessed_at=datetime(2026, 4, 25, 12, 0, tzinfo=timezone.utc),
    )

    payload = public_area_score_payload(area_score)

    assert payload is not None
    assert payload.scores["road_condition"] == 4
    assert payload.scores["security"] == 5
    assert payload.last_assessed_at == "2026-04-25T12:00:00+00:00"


def test_read_and_clear_stored_report_round_trip() -> None:
    report = ValuationReportPayload(
        area_scores={
            "road_condition": 4,
            "electricity_supply_hours": 3,
            "security": 5,
            "proximity": 2,
        },
        area_scores_last_updated="2026-04-25T12:00:00+00:00",
        inspector_note="Well maintained access road and calm surroundings.",
        report_date="2026-04-25",
    )
    listing = SimpleNamespace(
        type_data={
            "_valuation_report": report.model_dump(),
            "_valuation_report_text": "Beebop Valuation Report",
        }
    )

    stored = read_stored_report(listing)

    assert isinstance(stored, CachedValuationReport)
    assert stored.report.report_date == "2026-04-25"
    assert stored.formatted_text == "Beebop Valuation Report"

    clear_stored_report(listing)
    assert listing.type_data == {}
