"""Focused tests for Sprint 7 inspection-review helpers."""

from __future__ import annotations

from types import SimpleNamespace

from app.admin.review_service import (
    InspectionAssessment,
    _apply_confirmed_amenities,
)


def test_apply_confirmed_amenities_marks_only_present_items() -> None:
    listing = SimpleNamespace(
        amenities={
            "power": {
                "generator": {"present": True},
                "solar": {"present": True},
            }
        }
    )
    assessment = InspectionAssessment.model_validate(
        {
            "checklist": {
                "existence": "yes",
                "accuracy": "accurate",
                "structuralCondition": 4,
                "amenities": {
                    "power": {
                        "generator": "present",
                        "solar": "absent",
                    }
                },
            }
        }
    )

    _apply_confirmed_amenities(listing=listing, assessment=assessment)

    assert listing.amenities["power"]["generator"]["confirmed"] is True
    assert "confirmed" not in listing.amenities["power"]["solar"]
    assert listing.amenities["power"]["solar"]["present"] is True
