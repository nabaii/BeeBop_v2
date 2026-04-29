"""Public search + listing detail endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_current_user_optional
from app.core.redis_client import get_redis
from app.database import get_db
from app.models._enums import ListingCategory, ListingStatus
from app.models.bookmark import Bookmark
from app.models.listing import Listing
from app.models.user import User
from app.search import service as search_service
from app.search.schemas import (
    OffCampusFilters,
    PublicAreaScore,
    PublicListingDetail,
    RentFilters,
    SalesFilters,
    SearchResponse,
    ShortLetFilters,
    ValuationReport,
)
from app.verification.reports import (
    get_area_score_for_listing,
    get_or_generate_valuation_report,
    public_area_score_payload,
)

router = APIRouter(tags=["search"])


@router.get("/search/off-campus", response_model=SearchResponse)
async def search_off_campus(
    filters: OffCampusFilters = Depends(),
    current: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    if current is not None:
        if current.institution and not filters.institution:
            filters.institution = current.institution
        if current.gender and filters.gender is None:
            filters.gender = current.gender
    return await search_service.search_off_campus(filters, db=db)


@router.get("/search/short-let", response_model=SearchResponse)
async def search_short_let(
    filters: ShortLetFilters = Depends(),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    return await search_service.search_short_let(filters, db=db)


@router.get("/search/rent", response_model=SearchResponse)
async def search_rent(
    filters: RentFilters = Depends(),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    return await search_service.search_rent(filters, db=db)


@router.get("/search/sales", response_model=SearchResponse)
async def search_sales(
    filters: SalesFilters = Depends(),
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
        .options(selectinload(Listing.photos), selectinload(Listing.documents))
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
        price=float(listing.price) if listing.price is not None else None,
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
    )


@router.get("/public/featured", response_model=list[dict])
async def featured_listings(
    limit: int = Query(default=6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    stmt = (
        select(Listing)
        .where(
            Listing.status.in_(
                (
                    ListingStatus.FULLY_VERIFIED,
                    ListingStatus.DOC_VERIFIED,
                )
            )
        )
        .options(selectinload(Listing.photos))
        .order_by(Listing.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().unique().all()
    return [search_service._summarise(r).model_dump() for r in rows]
