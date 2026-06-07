"""Listing deletion unit tests."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.security import hash_password
from app.listings import service as listing_service
from app.listings.schemas import ListingDeletePayload
from app.models._enums import ListingStatus


class FakeResult:
    def __init__(self, listing: object | None) -> None:
        self.listing = listing

    def scalar_one_or_none(self) -> object | None:
        return self.listing


class FakeDb:
    def __init__(self, listing: object | None) -> None:
        self.listing = listing

    async def execute(self, _statement: object) -> FakeResult:
        return FakeResult(self.listing)


def _user(password_hash: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="landlord@example.com",
        password_hash=password_hash,
    )


def _listing(owner_id: uuid.UUID, **overrides: object) -> SimpleNamespace:
    base = {
        "id": uuid.uuid4(),
        "owner_id": owner_id,
        "status": ListingStatus.DRAFT,
        "deleted_at": None,
        "photos": [],
        "documents": [],
    }
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_delete_draft_listing_no_password_needed() -> None:
    user = _user()
    listing = _listing(owner_id=user.id, status=ListingStatus.DRAFT)
    db = FakeDb(listing)
    payload = ListingDeletePayload(password=None)

    await listing_service.delete_listing(
        user=user,  # type: ignore[arg-type]
        listing_id=listing.id,
        payload=payload,
        db=db,  # type: ignore[arg-type]
    )

    assert listing.status == ListingStatus.DELISTED
    assert listing.deleted_at is not None


@pytest.mark.asyncio
async def test_delete_published_listing_success() -> None:
    p_hash = hash_password("mypass123")
    user = _user(password_hash=p_hash)
    listing = _listing(owner_id=user.id, status=ListingStatus.LIVE_UNVERIFIED)
    db = FakeDb(listing)
    payload = ListingDeletePayload(password="mypass123")

    await listing_service.delete_listing(
        user=user,  # type: ignore[arg-type]
        listing_id=listing.id,
        payload=payload,
        db=db,  # type: ignore[arg-type]
    )

    assert listing.status == ListingStatus.DELISTED
    assert listing.deleted_at is not None


@pytest.mark.asyncio
async def test_delete_published_listing_requires_password() -> None:
    p_hash = hash_password("mypass123")
    user = _user(password_hash=p_hash)
    listing = _listing(owner_id=user.id, status=ListingStatus.LIVE_UNVERIFIED)
    db = FakeDb(listing)
    payload = ListingDeletePayload(password=None)

    with pytest.raises(ValidationError) as exc:
        await listing_service.delete_listing(
            user=user,  # type: ignore[arg-type]
            listing_id=listing.id,
            payload=payload,
            db=db,  # type: ignore[arg-type]
        )

    assert exc.value.code == "password_required"
    assert listing.status == ListingStatus.LIVE_UNVERIFIED


@pytest.mark.asyncio
async def test_delete_published_listing_incorrect_password() -> None:
    p_hash = hash_password("mypass123")
    user = _user(password_hash=p_hash)
    listing = _listing(owner_id=user.id, status=ListingStatus.LIVE_UNVERIFIED)
    db = FakeDb(listing)
    payload = ListingDeletePayload(password="wrongpass")

    with pytest.raises(ForbiddenError) as exc:
        await listing_service.delete_listing(
            user=user,  # type: ignore[arg-type]
            listing_id=listing.id,
            payload=payload,
            db=db,  # type: ignore[arg-type]
        )

    assert exc.value.code == "incorrect_password"
    assert listing.status == ListingStatus.LIVE_UNVERIFIED


@pytest.mark.asyncio
async def test_delete_listing_not_owned() -> None:
    user = _user()
    other_owner_id = uuid.uuid4()
    listing = _listing(owner_id=other_owner_id, status=ListingStatus.DRAFT)
    db = FakeDb(listing)
    payload = ListingDeletePayload(password=None)

    with pytest.raises(ForbiddenError) as exc:
        await listing_service.delete_listing(
            user=user,  # type: ignore[arg-type]
            listing_id=listing.id,
            payload=payload,
            db=db,  # type: ignore[arg-type]
        )

    assert exc.value.code == "listing_not_yours"
    assert listing.status == ListingStatus.DRAFT


@pytest.mark.asyncio
async def test_delete_already_deleted_listing() -> None:
    user = _user()
    listing = _listing(
        owner_id=user.id,
        status=ListingStatus.DELISTED,
        deleted_at=datetime.now(timezone.utc),
    )
    db = FakeDb(listing)
    payload = ListingDeletePayload(password=None)

    with pytest.raises(NotFoundError) as exc:
        await listing_service.delete_listing(
            user=user,  # type: ignore[arg-type]
            listing_id=listing.id,
            payload=payload,
            db=db,  # type: ignore[arg-type]
        )

    assert exc.value.code == "listing_not_found"
