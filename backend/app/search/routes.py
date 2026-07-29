"""Public search + listing detail endpoints."""

from __future__ import annotations

import uuid

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_current_user_optional
from app.core.redis_client import get_redis
from app.database import get_db
from app.models._enums import Gender, ListingCategory, ListingStatus
from app.models.bookmark import Bookmark
from app.models.listing import Listing
from app.models.student_accommodation import UnitType
from app.models.user import User
from app.search import service as search_service
from app.search.schemas import (
    OffCampusFilters,
    PublicAreaScore,
    PublicListingDetail,
    PublicRoom,
    PublicUnitType,
    PublicUnitTypePhoto,
    RentFilters,
    SalesFilters,
    SearchResponse,
    ShortLetFilters,
    SortOption,
    ValuationReport,
    VerificationTier,
)
from app.verification.reports import (
    get_area_score_for_listing,
    get_or_generate_valuation_report,
    public_area_score_payload,
)

router = APIRouter(tags=["search"])

_DEFAULT_VERIFICATION: list[VerificationTier] = [
    "fully_verified",
    "doc_verified",
    "unverified",
]


def _shared_filter_kwargs(
    q: str | None = None,
    locations: Annotated[list[str] | None, Query()] = None,
    verification: Annotated[list[VerificationTier] | None, Query()] = None,
    amenities: Annotated[list[str] | None, Query()] = None,
    min_price: Annotated[float | None, Query(ge=0)] = None,
    max_price: Annotated[float | None, Query(ge=0)] = None,
    sort: SortOption = "relevance",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=60)] = 24,
) -> dict[str, object]:
    return {
        "q": q,
        "locations": locations or [],
        "verification": verification or list(_DEFAULT_VERIFICATION),
        "amenities": amenities or [],
        "min_price": min_price,
        "max_price": max_price,
        "sort": sort,
        "page": page,
        "page_size": page_size,
    }


def _off_campus_filters(
    shared: Annotated[dict[str, object], Depends(_shared_filter_kwargs)],
    use_profile_filters: Annotated[bool, Query()] = False,
    institution: str | None = None,
    gender: Annotated[Gender | None, Query()] = None,
    unit_kinds: Annotated[list[str] | None, Query()] = None,
    available_now: Annotated[bool, Query()] = False,
) -> OffCampusFilters:
    return OffCampusFilters(
        **shared,
        use_profile_filters=use_profile_filters,
        institution=institution,
        gender=gender,
        unit_kinds=unit_kinds or [],
        available_now=available_now,
    )


def _short_let_filters(
    shared: Annotated[dict[str, object], Depends(_shared_filter_kwargs)],
    check_in: Annotated[date | None, Query()] = None,
    check_out: Annotated[date | None, Query()] = None,
    guests: Annotated[int | None, Query(ge=1)] = None,
    min_stay: Annotated[int | None, Query(ge=1)] = None,
    instant_booking: Annotated[bool | None, Query()] = None,
    min_rating: Annotated[float | None, Query(ge=0, le=5)] = None,
) -> ShortLetFilters:
    return ShortLetFilters(
        **shared,
        check_in=check_in,
        check_out=check_out,
        guests=guests,
        min_stay=min_stay,
        instant_booking=instant_booking,
        min_rating=min_rating,
    )


def _rent_filters(
    shared: Annotated[dict[str, object], Depends(_shared_filter_kwargs)],
    bedroom_counts: Annotated[list[int] | None, Query()] = None,
    property_types: Annotated[list[str] | None, Query()] = None,
    furnishing: Annotated[list[str] | None, Query()] = None,
    payment_structure: Annotated[list[str] | None, Query()] = None,
    available_from: Annotated[date | None, Query()] = None,
) -> RentFilters:
    return RentFilters(
        **shared,
        bedroom_counts=bedroom_counts or [],
        property_types=property_types or [],
        furnishing=furnishing or [],
        payment_structure=payment_structure or [],
        available_from=available_from,
    )


def _sales_filters(
    shared: Annotated[dict[str, object], Depends(_shared_filter_kwargs)],
    bedroom_counts: Annotated[list[int] | None, Query()] = None,
    property_types: Annotated[list[str] | None, Query()] = None,
    development_status: Annotated[list[str] | None, Query()] = None,
    title_types: Annotated[list[str] | None, Query()] = None,
) -> SalesFilters:
    return SalesFilters(
        **shared,
        bedroom_counts=bedroom_counts or [],
        property_types=property_types or [],
        development_status=development_status or [],
        title_types=title_types or [],
    )


@router.get("/search/off-campus", response_model=SearchResponse)
async def search_off_campus(
    filters: OffCampusFilters = Depends(_off_campus_filters),
    current: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    if filters.use_profile_filters and current is not None:
        if current.institution and not filters.institution:
            filters.institution = current.institution
        if current.gender and filters.gender is None:
            filters.gender = current.gender
    return await search_service.search_off_campus(filters, db=db)


@router.get("/search/short-let", response_model=SearchResponse)
async def search_short_let(
    filters: ShortLetFilters = Depends(_short_let_filters),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    return await search_service.search_short_let(filters, db=db)


@router.get("/search/rent", response_model=SearchResponse)
async def search_rent(
    filters: RentFilters = Depends(_rent_filters),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    return await search_service.search_rent(filters, db=db)


@router.get("/search/sales", response_model=SearchResponse)
async def search_sales(
    filters: SalesFilters = Depends(_sales_filters),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    return await search_service.search_sales(filters, db=db)


_PUBLIC_STATUSES = (
    ListingStatus.LIVE_UNVERIFIED,
    ListingStatus.DOC_VERIFIED,
    ListingStatus.FULLY_VERIFIED,
    ListingStatus.LET_AGREED,
    ListingStatus.SALE_AGREED,
)


@router.get("/public/listings/{listing_id}", response_model=PublicListingDetail)
async def public_listing_detail(
    listing_id: uuid.UUID,
    current: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> PublicListingDetail:
    stmt = (
        select(Listing)
        .where(Listing.id == listing_id)
        .options(
            selectinload(Listing.photos),
            selectinload(Listing.documents),
            selectinload(Listing.unit_types).selectinload(UnitType.rooms),
            selectinload(Listing.unit_types).selectinload(UnitType.photos),
        )
    )
    listing = (await db.execute(stmt)).scalar_one_or_none()
    if listing is None or listing.status not in _PUBLIC_STATUSES:
        raise HTTPException(status_code=404, detail="Listing not found")

    is_bookmarked = False
    if current is not None:
        result = await db.execute(
            select(Bookmark).where(
                Bookmark.user_id == current.id,
                Bookmark.listing_id == listing.id,
            )
        )
        is_bookmarked = result.scalar_one_or_none() is not None

    area_score = public_area_score_payload(
        await get_area_score_for_listing(listing=listing, db=db)
    )

    valuation: ValuationReport | None = None
    if current is not None:
        report = await get_or_generate_valuation_report(listing=listing, db=db, redis=redis)
        if report is not None:
            valuation = ValuationReport(
                area_scores=report.area_scores,
                area_scores_last_updated=report.area_scores_last_updated,
                inspector_note=report.inspector_note,
                report_date=report.report_date,
            )

    # One source of truth for the headline price: off-campus uses the cheapest
    # unit (matching the card and the sticky CTA bar); others use Listing.price.
    if listing.category == ListingCategory.OFF_CAMPUS:
        detail_price, detail_period = search_service.off_campus_starting_unit(listing)
    else:
        detail_price = float(listing.price) if listing.price is not None else None
        detail_period = None

    return PublicListingDetail(
        id=str(listing.id),
        category=listing.category,
        status=listing.status,
        title=listing.title or "Untitled",
        subtitle=listing.subtitle,
        description=listing.description or "",
        district=listing.district,
        gps_lat=listing.gps_lat,
        gps_lng=listing.gps_lng,
        price=detail_price,
        price_period=detail_period,
        amenities=listing.amenities or {},
        type_data=listing.type_data or {},
        photos=[
            {
                "id": str(p.id),
                "url": p.url,
                "room_label": p.room_label,
                "is_cover": p.is_cover,
                "display_order": p.display_order,
                "is_inspector_walkthrough": p.is_inspector_walkthrough,
            }
            for p in sorted(listing.photos, key=lambda p: p.display_order)
        ],
        area_score=(
            PublicAreaScore.model_validate(area_score.model_dump())
            if area_score is not None
            else None
        ),
        valuation_report=valuation,
        is_bookmarked=is_bookmarked,
        unit_types=[
            PublicUnitType(
                id=str(u.id),
                name=u.name,
                kind=str(u.kind),
                price=float(u.price),
                price_period=u.price_period,
                beds_per_room=u.beds_per_room,
                total_units=u.total_units,
                gender_tag=u.gender_tag,
                amenities=u.amenities or [],
                beds_total=sum(r.beds_total for r in u.rooms),
                beds_available=sum(r.beds_available for r in u.rooms),
                rooms=[
                    PublicRoom(
                        id=str(r.id),
                        name=r.name,
                        beds_total=r.beds_total,
                        beds_available=r.beds_available,
                    )
                    for r in u.rooms
                ],
                photos=[
                    PublicUnitTypePhoto(
                        id=str(p.id),
                        url=p.url,
                        room_label=p.room_label,
                        is_cover=p.is_cover,
                        display_order=p.display_order,
                    )
                    for p in sorted(u.photos, key=lambda p: p.display_order)
                ],
            )
            # Cheapest first so the "From ₦X" headline matches the top of the list.
            for u in sorted(listing.unit_types, key=lambda u: float(u.price))
        ],
    )


@router.get("/public/featured", response_model=list[dict])
async def featured_listings(
    limit: int = Query(default=6, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    stmt = (
        select(Listing)
        # Featured must match what seekers can actually see elsewhere. Reuse
        # _PUBLIC_STATUSES (the same set the detail endpoint allows) so this row
        # stays one source of truth with the rest of public visibility —
        # otherwise live-but-unverified listings (the normal state for a freshly
        # posted listing this test phase) silently vanish from this row.
        .where(Listing.status.in_(_PUBLIC_STATUSES))
        # Featured mixes categories; off-campus rows need their unit types
        # loaded so _summarise can derive a "from" price (it accesses
        # listing.unit_types for that category).
        .options(selectinload(Listing.photos), selectinload(Listing.unit_types))
        .order_by(Listing.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().unique().all()
    return [search_service._summarise(r).model_dump() for r in rows]
