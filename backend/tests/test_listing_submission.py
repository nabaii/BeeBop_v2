"""Listing submission validation — pure service-layer tests with stubbed
ORM objects so we don't need a database to cover the state machine."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.listings import service as listing_service
from app.listings.service import (
    _ensure_can_list,
    _status_after_submission,
    _validate_ready_for_submission,
    _validate_type_data,
)
from app.core.exceptions import ForbiddenError, ValidationError
from app.models._enums import AccountType, ListingCategory, ListingStatus, UserRole


def _listing(**overrides: object) -> SimpleNamespace:
    base = {
        "id": uuid.uuid4(),
        "category": ListingCategory.RENT,
        "status": ListingStatus.DRAFT,
        "title": "Lovely 2-bed in Wuse 2",
        "description": "x" * 220,
        "address_line": "12 Some Street, Wuse 2, Abuja",
        "gps_lat": 9.07,
        "gps_lng": 7.48,
        "price": 2_500_000,
        "type_data": {
            "bedroom_count": 2,
            "property_type": "flat",
            "furnishing": "unfurnished",
            "payment_structure": "annual",
            "available_from": "2026-06-01",
        },
        "amenities": {},
        "photos": [SimpleNamespace(id=uuid.uuid4(), is_inspector_walkthrough=False)],
        "documents": [SimpleNamespace(id=uuid.uuid4())],
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_landlord_can_create_listing_after_account_type_without_identity_validation() -> None:
    user = SimpleNamespace(role=UserRole.LANDLORD, account_type=AccountType.INDIVIDUAL)
    _ensure_can_list(user)  # Should not require NIN/CAC verification in test phase.


def test_landlord_cannot_create_listing_before_account_type() -> None:
    user = SimpleNamespace(role=UserRole.LANDLORD, account_type=None)
    with pytest.raises(ForbiddenError):
        _ensure_can_list(user)


def test_rent_listing_ready_for_submission() -> None:
    assert _validate_ready_for_submission(_listing()) == []


def test_rent_listing_missing_photos() -> None:
    missing = _validate_ready_for_submission(_listing(photos=[]))
    assert "photos" in missing


def test_rent_listing_documents_optional_in_test_phase(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        listing_service,
        "get_settings",
        lambda: SimpleNamespace(listing_document_review_required=False),
    )
    missing = _validate_ready_for_submission(_listing(documents=[]))
    assert "documents" not in missing


def test_rent_listing_requires_documents_when_review_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        listing_service,
        "get_settings",
        lambda: SimpleNamespace(listing_document_review_required=True),
    )
    missing = _validate_ready_for_submission(_listing(documents=[]))
    assert "documents" in missing


def test_off_campus_does_not_require_documents() -> None:
    # Off-campus is exempt from the doc-badge gate per product brief §3.1.
    listing = _listing(
        category=ListingCategory.OFF_CAMPUS,
        documents=[],
        type_data={"institutions_accepted": ["Unilag"]},
    )
    missing = _validate_ready_for_submission(listing)
    assert "documents" not in missing


def test_rent_submission_posts_live_unverified_in_test_phase(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        listing_service,
        "get_settings",
        lambda: SimpleNamespace(listing_document_review_required=False),
    )
    assert _status_after_submission(_listing()) == ListingStatus.LIVE_UNVERIFIED


def test_rent_submission_uses_doc_review_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        listing_service,
        "get_settings",
        lambda: SimpleNamespace(listing_document_review_required=True),
    )
    assert _status_after_submission(_listing()) == ListingStatus.UNDER_DOC_REVIEW


def test_short_description_flagged() -> None:
    missing = _validate_ready_for_submission(_listing(description="too short"))
    assert "description_too_short" in missing


def test_short_let_requires_price() -> None:
    listing = _listing(
        category=ListingCategory.SHORT_LET,
        price=None,
        type_data={
            "base_rate": 30000,
            "min_stay_nights": 1,
            "turnaround_days": 1,
            "instant_booking": True,
        },
    )
    missing = _validate_ready_for_submission(listing)
    assert "price" in missing


def test_rent_type_data_validation_catches_bad_payment_structure() -> None:
    listing = _listing(type_data={**_listing().type_data, "payment_structure": "monthly"})
    with pytest.raises(ValidationError):
        _validate_type_data(listing)


def test_sales_type_data_accepts_land_only() -> None:
    listing = _listing(
        category=ListingCategory.SALES,
        type_data={
            "property_type": "land_only",
            "development_status": "ready",
            "title_type": "c_of_o",
        },
    )
    # Should not raise.
    _validate_type_data(listing)
