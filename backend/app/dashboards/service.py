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
    MonthlyIncome,
    ListingRevenueStats,
)
from app.models._enums import (
    Gender,
    ListingCategory,
    NotificationChannel,
    UserRole,
    ListingStatus,
    BookingStatus,
)
from app.models.bookmark import Bookmark
from app.models.listing import Listing
from app.models.notification import Notification
from app.models.student_accommodation import Room, UnitType
from app.models.user import User
from app.models.agreement import Agreement
from app.models.offer import Offer
from app.models.booking import Booking


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
    total_listings = sum(r.count for r in breakdown)

    # 2. Fetch all listings for this landlord with their photo records
    listings_stmt = (
        select(Listing)
        .where(Listing.owner_id == user.id)
        .options(selectinload(Listing.photos))
    )
    listings = (await db.execute(listings_stmt)).scalars().all()

    total_income = 0.0
    listing_stats = []
    occupancy_rates = []

    # Map month keys for historical trend (past 6 months)
    today = datetime.now(timezone.utc).date()
    months_keys = []
    monthly_map = {}
    for i in range(5, -1, -1):
        first_of_month = (today.replace(day=1) - timedelta(days=i*30))
        month_name = first_of_month.strftime("%b")
        months_keys.append(month_name)
        monthly_map[first_of_month.strftime("%Y-%m")] = {"name": month_name, "amount": 0.0}

    for l in listings:
        l_income = 0.0
        l_occupancy = 0.0
        
        # A. Calculate Income & Monthly distribution
        if l.category == ListingCategory.SHORT_LET:
            bookings_stmt = select(Booking).where(
                Booking.listing_id == l.id,
                Booking.payment_confirmed_at.is_not(None)
            )
            bookings = (await db.execute(bookings_stmt)).scalars().all()
            for b in bookings:
                amt = float(b.base_total)
                l_income += amt
                if b.payment_confirmed_at:
                    m_key = b.payment_confirmed_at.strftime("%Y-%m")
                    if m_key in monthly_map:
                        monthly_map[m_key]["amount"] += amt

            # Short let occupancy: ratio of booked days in last 30 days
            start_window = today - timedelta(days=30)
            booked_days = 0
            for b in bookings:
                if b.status == BookingStatus.CONFIRMED:
                    overlap_start = max(b.check_in, start_window)
                    overlap_end = min(b.check_out, today)
                    if overlap_start < overlap_end:
                        booked_days += (overlap_end - overlap_start).days
            l_occupancy = min(100.0, (booked_days / 30.0) * 100.0)

        elif l.category == ListingCategory.OFF_CAMPUS:
            ag_stmt = (
                select(Offer.price, Agreement.payment_confirmed_at)
                .join(Agreement, Agreement.offer_id == Offer.id)
                .where(
                    Agreement.listing_id == l.id,
                    Agreement.payment_confirmed_at.is_not(None)
                )
            )
            results = (await db.execute(ag_stmt)).all()
            for price, confirmed_at in results:
                amt = float(price)
                l_income += amt
                if confirmed_at:
                    m_key = confirmed_at.strftime("%Y-%m")
                    if m_key in monthly_map:
                        monthly_map[m_key]["amount"] += amt

            # Student occupancy: from rooms table beds
            rooms_stmt = (
                select(Room)
                .join(UnitType, Room.unit_type_id == UnitType.id)
                .where(UnitType.listing_id == l.id)
            )
            rooms = (await db.execute(rooms_stmt)).scalars().all()
            total_beds = sum(r.beds_total for r in rooms)
            avail_beds = sum(r.beds_available for r in rooms)
            if total_beds > 0:
                l_occupancy = ((total_beds - avail_beds) / total_beds) * 100.0
            else:
                l_occupancy = 0.0

        else: # Rent or Sales
            ag_stmt = (
                select(Offer.price, Agreement.payment_confirmed_at)
                .join(Agreement, Agreement.offer_id == Offer.id)
                .where(
                    Agreement.listing_id == l.id,
                    Agreement.payment_confirmed_at.is_not(None)
                )
            )
            results = (await db.execute(ag_stmt)).all()
            for price, confirmed_at in results:
                amt = float(price)
                l_income += amt
                if confirmed_at:
                    m_key = confirmed_at.strftime("%Y-%m")
                    if m_key in monthly_map:
                        monthly_map[m_key]["amount"] += amt

            # Rent / Sales occupancy: status based
            if l.status in (ListingStatus.LET_AGREED, ListingStatus.SALE_AGREED):
                l_occupancy = 100.0
            else:
                l_occupancy = 0.0

        total_income += l_income
        occupancy_rates.append(l_occupancy)

        cover_photo = next((p.url for p in l.photos if p.is_cover), None)
        if not cover_photo and l.photos:
            cover_photo = l.photos[0].url

        price_val = float(l.price) if l.price is not None else None

        listing_stats.append(
            ListingRevenueStats(
                listing_id=str(l.id),
                title=l.title,
                category=l.category,
                status=l.status,
                price=price_val,
                total_income=l_income,
                occupancy_rate=l_occupancy,
                view_count=l.view_count,
                save_count=l.save_count,
                enquiry_count=l.enquiry_count,
                cover_photo_url=cover_photo,
            )
        )

    avg_occupancy = sum(occupancy_rates) / len(occupancy_rates) if occupancy_rates else 0.0

    monthly_income = []
    for k in sorted(monthly_map.keys()):
        monthly_income.append(
            MonthlyIncome(
                month=monthly_map[k]["name"],
                amount=monthly_map[k]["amount"]
            )
        )

    return LandlordOverview(
        listings_total=total_listings,
        listings_by_status=breakdown,
        unread_notifications=await _unread_count(user.id, db=db),
        total_income=total_income,
        occupancy_rate=avg_occupancy,
        monthly_income=monthly_income,
        listing_stats=listing_stats,
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
