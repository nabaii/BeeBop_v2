"""Aggregation queries for the dashboard endpoints."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.dashboards.schemas import (
    CountByStatus,
    GenderBreakdown,
    LandlordOverview,
    ListingAnalytics,
    SeekerOverview,
    ShortLetCalendar,
    ShortLetCalendarDay,
    ShortLetDashboard,
    ShortLetPricingView,
    StudentPMS,
    UnitOccupancy,
)
from app.models._enums import (
    Gender,
    ListingCategory,
    NotificationChannel,
    UserRole,
)
from app.models.bookmark import Bookmark
from app.models.listing import Listing
from app.models.notification import Notification
from app.models.student_accommodation import Room, UnitType
from app.models.user import User


# ---------------------------------------------------------------------------
# Seeker overview
# ---------------------------------------------------------------------------


async def seeker_overview(*, user: User, db: AsyncSession) -> SeekerOverview:
    saved_count = int(
        (
            await db.execute(
                select(func.count()).select_from(
                    select(Bookmark).where(Bookmark.user_id == user.id).subquery()
                )
            )
        ).scalar_one()
    )
    unread = await _unread_count(user.id, db=db)
    return SeekerOverview(saved_count=saved_count, unread_notifications=unread)


# ---------------------------------------------------------------------------
# Landlord overview + analytics
# ---------------------------------------------------------------------------


async def landlord_overview(*, user: User, db: AsyncSession) -> LandlordOverview:
    if user.role not in (UserRole.LANDLORD, UserRole.AGENT):
        raise ForbiddenError("Landlord dashboard is for landlords/agents.")

    stmt = (
        select(Listing.status, func.count())
        .where(Listing.owner_id == user.id)
        .group_by(Listing.status)
    )
    rows = (await db.execute(stmt)).all()
    breakdown = [CountByStatus(status=s, count=int(c)) for s, c in rows]
    total = sum(r.count for r in breakdown)

    return LandlordOverview(
        listings_total=total,
        listings_by_status=breakdown,
        unread_notifications=await _unread_count(user.id, db=db),
    )


async def landlord_analytics(*, user: User, db: AsyncSession) -> list[ListingAnalytics]:
    if user.role not in (UserRole.LANDLORD, UserRole.AGENT):
        raise ForbiddenError("Landlord analytics is for landlords/agents.")
    stmt = select(Listing).where(Listing.owner_id == user.id).order_by(Listing.created_at.desc())
    listings = (await db.execute(stmt)).scalars().all()
    return [
        ListingAnalytics(
            listing_id=str(l.id),
            title=l.title,
            category=l.category,
            view_count=l.view_count,
            save_count=l.save_count,
            enquiry_count=l.enquiry_count,
        )
        for l in listings
    ]


# ---------------------------------------------------------------------------
# Student PMS
# ---------------------------------------------------------------------------


async def student_pms(
    *, user: User, listing_id: uuid.UUID, db: AsyncSession
) -> StudentPMS:
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    if str(listing.owner_id) != str(user.id):
        raise ForbiddenError("Not your listing.", code="listing_not_yours")
    if listing.category != ListingCategory.OFF_CAMPUS:
        raise ValidationError(
            "PMS view only applies to off-campus listings.",
            code="not_student_listing",
        )

    stmt = (
        select(UnitType)
        .where(UnitType.listing_id == listing.id)
        .options(selectinload(UnitType.rooms))
        .order_by(UnitType.created_at)
    )
    units = (await db.execute(stmt)).scalars().all()

    overall = GenderBreakdown()
    unit_views: list[UnitOccupancy] = []
    for u in units:
        b = GenderBreakdown()
        for r in u.rooms:
            if r.gender_tag == Gender.FEMALE:
                b.female_total += r.beds_total
                b.female_available += r.beds_available
                overall.female_total += r.beds_total
                overall.female_available += r.beds_available
            elif r.gender_tag == Gender.MALE:
                b.male_total += r.beds_total
                b.male_available += r.beds_available
                overall.male_total += r.beds_total
                overall.male_available += r.beds_available
            else:
                b.any_total += r.beds_total
                b.any_available += r.beds_available
                overall.any_total += r.beds_total
                overall.any_available += r.beds_available
        unit_views.append(
            UnitOccupancy(
                unit_type_id=str(u.id),
                unit_name=u.name,
                kind=u.kind.value,
                beds_per_room=u.beds_per_room,
                total_units=u.total_units,
                breakdown=b,
            )
        )

    return StudentPMS(
        listing_id=str(listing.id),
        listing_title=listing.title,
        overall=overall,
        units=unit_views,
    )


# ---------------------------------------------------------------------------
# Short-let dashboard
# ---------------------------------------------------------------------------


def _calendar_days(
    *, today: date, days: int, td: dict
) -> list[ShortLetCalendarDay]:
    """Compute day states for the requested window.

    Sprint 5 scope: every day is `available` unless the previous day is the
    last day of a hypothetical booking — which we don't have until Sprint 11.
    Weekend uplift comes from `td.weekend_rate`. Bookings + turnaround days
    are wired in Sprint 11 by extending this helper.
    """
    base = float(td.get("base_rate") or 0) or None
    weekend = td.get("weekend_rate")
    weekend_rate = float(weekend) if weekend is not None else None

    out: list[ShortLetCalendarDay] = []
    for i in range(days):
        d = today + timedelta(days=i)
        is_weekend = d.weekday() in (4, 5)   # Fri, Sat — Nigerian short-let convention
        rate = weekend_rate if (is_weekend and weekend_rate) else base
        out.append(
            ShortLetCalendarDay(
                date=d,
                state="available",
                is_weekend=is_weekend,
                rate=rate,
            )
        )
    return out


async def short_let_dashboard(
    *, user: User, listing_id: uuid.UUID, days: int, db: AsyncSession
) -> ShortLetDashboard:
    if days < 7 or days > 90:
        raise ValidationError("Day window must be between 7 and 90.", code="bad_window")
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    if str(listing.owner_id) != str(user.id):
        raise ForbiddenError("Not your listing.", code="listing_not_yours")
    if listing.category != ListingCategory.SHORT_LET:
        raise ValidationError(
            "Calendar view only applies to short-let listings.",
            code="not_short_let",
        )

    td = listing.type_data or {}
    pricing = ShortLetPricingView(
        base_rate=float(td["base_rate"]) if td.get("base_rate") is not None else None,
        weekend_rate=float(td["weekend_rate"]) if td.get("weekend_rate") is not None else None,
        min_stay_nights=td.get("min_stay_nights"),
        turnaround_days=td.get("turnaround_days"),
        instant_booking=td.get("instant_booking"),
    )

    today = datetime.now(timezone.utc).date()
    calendar = ShortLetCalendar(
        listing_id=str(listing.id),
        days=_calendar_days(today=today, days=days, td=td),
    )

    return ShortLetDashboard(
        listing_id=str(listing.id),
        title=listing.title,
        pricing=pricing,
        calendar=calendar,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _unread_count(user_id: uuid.UUID, *, db: AsyncSession) -> int:
    stmt = (
        select(func.count())
        .select_from(
            select(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.channel == NotificationChannel.IN_APP,
                Notification.read_at.is_(None),
            )
            .subquery()
        )
    )
    return int((await db.execute(stmt)).scalar_one())
