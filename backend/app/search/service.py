"""Listing search — category-scoped filters + PostgreSQL FTS on title/desc."""

from __future__ import annotations

from typing import Any, TypeVar

from sqlalchemy import Boolean, Integer, String, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models._enums import Gender, ListingCategory, ListingStatus
from app.models.listing import Listing
from app.models.student_accommodation import Room, UnitType
from app.search.schemas import (
    OffCampusFilters,
    PublicListingSummary,
    RentFilters,
    SalesFilters,
    SearchResponse,
    SharedFilters,
    ShortLetFilters,
)

# Listings not visible to seekers regardless of filters.
_HIDDEN_STATUSES = (
    ListingStatus.DRAFT,
    ListingStatus.UNDER_DOC_REVIEW,
    ListingStatus.SUSPENDED,
    ListingStatus.DELISTED,
)


def _base_visibility_stmt():  # type: ignore[no-untyped-def]
    return (
        select(Listing)
        .where(Listing.status.not_in(_HIDDEN_STATUSES))
        .options(selectinload(Listing.photos))
    )


def _verification_clause(tiers: list[str]):  # type: ignore[no-untyped-def]
    """Build the OR clause that matches any of the requested verification tiers.

    During the test phase, seekers see unverified listings by default so newly
    posted landlord listings are discoverable before badge review is enabled.
    """
    if not tiers:
        # No tiers selected = no results (client bug, but don't fall back to
        # "show everything" — that's the opposite of the pre-checked default).
        return Listing.id.is_(None)
    clauses = []
    if "fully_verified" in tiers:
        clauses.append(
            Listing.status.in_(
                (
                    ListingStatus.FULLY_VERIFIED,
                    ListingStatus.LET_AGREED,
                    ListingStatus.SALE_AGREED,
                )
            )
        )
    if "doc_verified" in tiers:
        clauses.append(Listing.status == ListingStatus.DOC_VERIFIED)
    if "unverified" in tiers:
        clauses.append(Listing.status == ListingStatus.LIVE_UNVERIFIED)
    return or_(*clauses)


def _apply_shared(stmt, filters: SharedFilters):  # type: ignore[no-untyped-def]
    stmt = stmt.where(_verification_clause(filters.verification))
    if filters.q:
        # Per-word ILIKE matching.  Each keyword must match in at least one
        # of title / description / district, but different keywords can match
        # in different fields.  This gives much better recall than requiring
        # the entire phrase as a single substring.
        words = [w.strip() for w in filters.q.split() if w.strip()]
        for word in words:
            like = f"%{word}%"
            stmt = stmt.where(
                or_(
                    Listing.title.ilike(like),
                    Listing.description.ilike(like),
                    Listing.district.ilike(like),
                )
            )
    if filters.locations:
        stmt = stmt.where(Listing.district.in_(filters.locations))
    if filters.min_price is not None:
        stmt = stmt.where(Listing.price >= filters.min_price)
    if filters.max_price is not None:
        stmt = stmt.where(Listing.price <= filters.max_price)
    for token in filters.amenities:
        if ":" not in token:
            continue
        group, key = token.split(":", 1)
        stmt = stmt.where(
            cast(Listing.amenities[group][key]["present"].astext, Boolean).is_(True)   # type: ignore[index]
        )
    return stmt


def _sort(stmt, sort: str):  # type: ignore[no-untyped-def]
    if sort == "price_asc":
        return stmt.order_by(Listing.price.asc().nulls_last())
    if sort == "price_desc":
        return stmt.order_by(Listing.price.desc().nulls_last())
    if sort == "newest":
        return stmt.order_by(Listing.created_at.desc())
    # relevance and highest_rated share the default ordering in Sprint 3;
    # rating is layered in Sprint 4 (when the Review model is populated).
    # Default: verified first (derived from status), then most recent.
    return stmt.order_by(
        Listing.status.desc(),       # enum lexicographic order happens to put verified > unverified
        Listing.created_at.desc(),
    )


def _summarise(listing: Listing) -> PublicListingSummary:
    cover = next((p for p in listing.photos if p.is_cover), None) or next(iter(listing.photos), None)
    return PublicListingSummary(
        id=str(listing.id),
        category=listing.category,
        status=listing.status,
        title=listing.title or "Untitled",
        subtitle=listing.subtitle,
        price=float(listing.price) if listing.price is not None else None,
        district=listing.district,
        gps_lat=listing.gps_lat,
        gps_lng=listing.gps_lng,
        cover_url=cover.url if cover else None,
        rating=None,        # populated from Review aggregations in Sprint 4
        review_count=0,
    )


async def _paginate(
    db: AsyncSession, stmt, *, category: ListingCategory, page: int, page_size: int
) -> SearchResponse:  # type: ignore[no-untyped-def]
    total_stmt = select(func.count()).select_from(stmt.subquery())
    total = int((await db.execute(total_stmt)).scalar_one())
    offset = (page - 1) * page_size
    rows = (await db.execute(stmt.offset(offset).limit(page_size))).scalars().unique().all()
    return SearchResponse(
        category=category,
        total=total,
        page=page,
        page_size=page_size,
        results=[_summarise(r) for r in rows],
    )


# ---------------------------------------------------------------------------
# Category services
# ---------------------------------------------------------------------------


async def search_off_campus(
    filters: OffCampusFilters, *, db: AsyncSession
) -> SearchResponse:
    stmt = _base_visibility_stmt().where(Listing.category == ListingCategory.OFF_CAMPUS)
    stmt = _apply_shared(stmt, filters)

    # Institution and gender are explicit filters when supplied. Gender
    # filtering is enforced at the room level: we join through UnitType/Room
    # and require at least one matching room.
    if filters.institution:
        stmt = stmt.where(
            Listing.type_data["institutions_accepted"].astext.ilike(   # type: ignore[attr-defined]
                f"%{filters.institution}%"
            )
        )
    if filters.gender and filters.gender in (Gender.FEMALE, Gender.MALE):
        # A listing matches if any room is Gender.ANY (self-contain — no tag)
        # or matches the seeker's gender.
        subq = (
            select(UnitType.listing_id)
            .join(Room, Room.unit_type_id == UnitType.id)
            .where(Room.gender_tag.in_((filters.gender, Gender.ANY)))
        ).subquery()
        stmt = stmt.where(Listing.id.in_(select(subq.c.listing_id)))

    if filters.unit_kinds:
        subq = (
            select(UnitType.listing_id)
            .where(UnitType.kind.in_(filters.unit_kinds))
        ).subquery()
        stmt = stmt.where(Listing.id.in_(select(subq.c.listing_id)))

    if filters.available_now:
        subq = (
            select(UnitType.listing_id)
            .join(Room, Room.unit_type_id == UnitType.id)
            .where(Room.beds_available > 0)
        ).subquery()
        stmt = stmt.where(Listing.id.in_(select(subq.c.listing_id)))

    stmt = _sort(stmt, filters.sort)
    return await _paginate(
        db, stmt, category=ListingCategory.OFF_CAMPUS, page=filters.page, page_size=filters.page_size
    )


async def search_short_let(
    filters: ShortLetFilters, *, db: AsyncSession
) -> SearchResponse:
    stmt = _base_visibility_stmt().where(Listing.category == ListingCategory.SHORT_LET)
    stmt = _apply_shared(stmt, filters)

    if filters.instant_booking is not None:
        stmt = stmt.where(
            cast(Listing.type_data["instant_booking"].astext, Boolean).is_(   # type: ignore[index]
                filters.instant_booking
            )
        )
    if filters.min_stay is not None:
        stmt = stmt.where(
            cast(Listing.type_data["min_stay_nights"].astext, Integer)   # type: ignore[index]
            <= filters.min_stay
        )
    # Date-range availability enforcement lands with the Bookings table
    # (Sprint 11) — a listing has a date conflict only when a booking exists.
    # For Sprint 3 the date range is accepted but not applied to filtering.

    stmt = _sort(stmt, filters.sort)
    return await _paginate(
        db, stmt, category=ListingCategory.SHORT_LET, page=filters.page, page_size=filters.page_size
    )


async def search_rent(filters: RentFilters, *, db: AsyncSession) -> SearchResponse:
    stmt = _base_visibility_stmt().where(Listing.category == ListingCategory.RENT)
    stmt = _apply_shared(stmt, filters)

    if filters.bedroom_counts:
        stmt = stmt.where(
            cast(Listing.type_data["bedroom_count"].astext, Integer).in_(filters.bedroom_counts)   # type: ignore[index]
        )
    if filters.property_types:
        stmt = stmt.where(
            Listing.type_data["property_type"].astext.in_(filters.property_types)   # type: ignore[attr-defined]
        )
    if filters.furnishing:
        stmt = stmt.where(
            Listing.type_data["furnishing"].astext.in_(filters.furnishing)   # type: ignore[attr-defined]
        )
    if filters.payment_structure:
        stmt = stmt.where(
            Listing.type_data["payment_structure"].astext.in_(filters.payment_structure)   # type: ignore[attr-defined]
        )

    stmt = _sort(stmt, filters.sort)
    return await _paginate(
        db, stmt, category=ListingCategory.RENT, page=filters.page, page_size=filters.page_size
    )


async def search_sales(filters: SalesFilters, *, db: AsyncSession) -> SearchResponse:
    stmt = _base_visibility_stmt().where(Listing.category == ListingCategory.SALES)
    stmt = _apply_shared(stmt, filters)

    if filters.bedroom_counts:
        stmt = stmt.where(
            cast(Listing.type_data["bedroom_count"].astext, Integer).in_(filters.bedroom_counts)   # type: ignore[index]
        )
    if filters.property_types:
        stmt = stmt.where(
            Listing.type_data["property_type"].astext.in_(filters.property_types)   # type: ignore[attr-defined]
        )
    if filters.development_status:
        stmt = stmt.where(
            Listing.type_data["development_status"].astext.in_(filters.development_status)   # type: ignore[attr-defined]
        )
    if filters.title_types:
        stmt = stmt.where(
            Listing.type_data["title_type"].astext.in_(filters.title_types)   # type: ignore[attr-defined]
        )

    stmt = _sort(stmt, filters.sort)
    return await _paginate(
        db, stmt, category=ListingCategory.SALES, page=filters.page, page_size=filters.page_size
    )
