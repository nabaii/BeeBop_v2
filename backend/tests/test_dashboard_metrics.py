"""Landlord dashboard metrics aggregation unit tests."""

from __future__ import annotations

import datetime
import uuid
from types import SimpleNamespace

import pytest

from app.dashboards.service import landlord_overview
from app.models._enums import UserRole, ListingCategory, ListingStatus, BookingStatus
from app.models.listing import Listing
from app.models.user import User


class FakeResult:
    def __init__(self, items: list) -> None:
        self._items = items

    def all(self) -> list:
        return self._items

    def scalars(self) -> FakeResult:
        return self

    def all_scalars(self) -> list:
        return self._items

    def scalar_one(self) -> any:
        if not self._items:
            return 0
        item = self._items[0]
        if isinstance(item, tuple):
            return item[0]
        return item

    def __iter__(self) -> iter:
        return iter(self._items)


class FakeDb:
    def __init__(self, execute_results: dict | None = None) -> None:
        self.execute_results = execute_results or {}
        self.executed: list = []

    async def execute(self, statement: object) -> FakeResult:
        self.executed.append(statement)
        stmt_str = str(statement).lower()
        
        if "group by" in stmt_str:
            return FakeResult(self.execute_results.get("status_counts", []))
        elif "from listings" in stmt_str:
            return FakeResult(self.execute_results.get("listings", []))
        elif "from bookings" in stmt_str:
            return FakeResult(self.execute_results.get("bookings", []))
        elif "from agreements" in stmt_str or "from offers" in stmt_str:
            return FakeResult(self.execute_results.get("agreements", []))
        elif "from rooms" in stmt_str:
            return FakeResult(self.execute_results.get("rooms", []))
        elif "from notifications" in stmt_str:
            return FakeResult([(0,)])
        
        return FakeResult([])


@pytest.mark.asyncio
async def test_landlord_overview_empty_portfolio() -> None:
    user = User(id=uuid.uuid4(), role=UserRole.LANDLORD, email="landlord@example.com")
    db = FakeDb({
        "status_counts": [],
        "listings": [],
    })

    result = await landlord_overview(user=user, db=db)  # type: ignore

    assert result.listings_total == 0
    assert result.total_income == 0.0
    assert result.occupancy_rate == 0.0
    assert len(result.listing_stats) == 0
    assert len(result.monthly_income) == 6


@pytest.mark.asyncio
async def test_landlord_overview_with_listings() -> None:
    user = User(id=uuid.uuid4(), role=UserRole.LANDLORD, email="landlord@example.com")
    
    l1 = Listing(
        id=uuid.uuid4(),
        owner_id=user.id,
        category=ListingCategory.RENT,
        status=ListingStatus.LET_AGREED,
        title="Ikeja Flat",
        price=1500000.00,
        view_count=10,
        save_count=5,
        enquiry_count=2,
    )
    l1.photos = []
    
    l2 = Listing(
        id=uuid.uuid4(),
        owner_id=user.id,
        category=ListingCategory.SHORT_LET,
        status=ListingStatus.DOC_VERIFIED,
        title="Lekki Villa",
        price=85000.00,
        view_count=25,
        save_count=12,
        enquiry_count=4,
    )
    l2.photos = []

    # Let the booking cover the last 3 days to match occupancy_rate = 10%
    today = datetime.datetime.now(datetime.timezone.utc).date()
    db = FakeDb({
        "status_counts": [
            (ListingStatus.LET_AGREED, 1),
            (ListingStatus.DOC_VERIFIED, 1),
        ],
        "listings": [l1, l2],
        "agreements": [
            (1500000.00, datetime.datetime.now(datetime.timezone.utc))
        ],
        "bookings": [
            SimpleNamespace(
                base_total=85000.00 * 3,
                payment_confirmed_at=datetime.datetime.now(datetime.timezone.utc),
                status=BookingStatus.CONFIRMED,
                check_in=today - datetime.timedelta(days=3),
                check_out=today,
            )
        ]
    })

    result = await landlord_overview(user=user, db=db)  # type: ignore

    assert result.listings_total == 2
    assert result.total_income == 1755000.0
    assert result.occupancy_rate == 55.0
    assert len(result.listing_stats) == 2
    assert result.listing_stats[0].title == "Ikeja Flat"
    assert result.listing_stats[0].total_income == 1500000.0
    assert result.listing_stats[1].title == "Lekki Villa"
    assert result.listing_stats[1].total_income == 255000.0
