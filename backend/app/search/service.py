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
    AllFilters,
    LocationOption,
    OffCampusFilters,
    PublicListingSummary,
    RentFilters,
    SalesFilters,
    SearchResponse,
    SearchScope,
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


def _as_float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _as_int(value: object) -> int | None:
    number = _as_float(value)
    return int(number) if number is not None else None


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


def _off_campus_price():  # type: ignore[no-untyped-def]
    """The price an off-campus listing is actually filtered and sorted on.

    Off-campus listings leave ``Listing.price`` null and price per unit type
    instead, so the shared price filter would exclude every one of them. This
    correlated subquery mirrors ``off_campus_starting_unit`` — the cheapest
    priced unit, which is the figure the card and detail headline both show.
    """
    return (
        select(func.min(UnitType.price))
        .where(UnitType.listing_id == Listing.id)
        .correlate(Listing)
        .scalar_subquery()
    )


def _apply_shared(stmt, filters: SharedFilters, *, price_col=None, apply_price: bool = True):  # type: ignore[no-untyped-def]
    """Apply the filters every category shares.

    ``price_col`` overrides the column the price range is compared against
    (off-campus prices per unit type, not on the listing row). ``apply_price``
    is False for the cross-category explore search, where one range cannot
    span nightly, annual, and outright prices.
    """
    price_col = Listing.price if price_col is None else price_col
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
        # Case- and whitespace-insensitive: the location tokens arrive from a
        # text box and from the conversational parser, neither of which can
        # guarantee the exact casing stored on the listing row.
        tokens = [loc.strip().lower() for loc in filters.locations if loc.strip()]
        if tokens:
            stmt = stmt.where(func.lower(Listing.district).in_(tokens))
    if apply_price:
        if filters.min_price is not None:
            stmt = stmt.where(price_col >= filters.min_price)
        if filters.max_price is not None:
            stmt = stmt.where(price_col <= filters.max_price)
    for token in filters.amenities:
        if ":" not in token:
            continue
        group, key = token.split(":", 1)
        stmt = stmt.where(
            cast(Listing.amenities[group][key]["present"].astext, Boolean).is_(True)   # type: ignore[index]
        )
    return stmt


def _sort(stmt, sort: str, *, price_col=None):  # type: ignore[no-untyped-def]
    price_col = Listing.price if price_col is None else price_col
    if sort == "price_asc":
        return stmt.order_by(price_col.asc().nulls_last())
    if sort == "price_desc":
        return stmt.order_by(price_col.desc().nulls_last())
    if sort == "newest":
        return stmt.order_by(Listing.created_at.desc())
    # relevance and highest_rated share the default ordering in Sprint 3;
    # rating is layered in Sprint 4 (when the Review model is populated).
    # Default: verified first (derived from status), then most recent.
    return stmt.order_by(
        Listing.status.desc(),       # enum lexicographic order happens to put verified > unverified
        Listing.created_at.desc(),
    )


def off_campus_starting_unit(listing: Listing) -> tuple[float | None, str | None]:
    """Single source of truth for an off-campus listing's headline price.

    Off-campus listings price per unit type, not on ``Listing.price``. The
    cheapest priced unit drives the "starting rate" shown everywhere — card,
    detail headline, and the sticky CTA bar — so they can never disagree.
    Returns ``(price, price_period)``.
    """
    priced = [u for u in listing.unit_types if u.price is not None and float(u.price) > 0]
    if not priced:
        return None, None
    cheapest = min(priced, key=lambda u: float(u.price))
    return float(cheapest.price), cheapest.price_period


def _summarise(listing: Listing) -> PublicListingSummary:
    photos = sorted(listing.photos, key=lambda p: p.display_order)
    cover = next((p for p in photos if p.is_cover), None) or (photos[0] if photos else None)
    secondary = next((p for p in photos if p is not cover), None)
    # Callers that can return off-campus rows (off-campus search, featured)
    # eager-load `unit_types`; the category guard keeps other searches from
    # touching the relationship.
    if listing.category == ListingCategory.OFF_CAMPUS:
        price, price_period = off_campus_starting_unit(listing)
    else:
        price = float(listing.price) if listing.price is not None else None
        price_period = None
    type_data = listing.type_data or {}
    return PublicListingSummary(
        id=str(listing.id),
        category=listing.category,
        status=listing.status,
        title=listing.title or "Untitled",
        subtitle=listing.subtitle,
        price=price,
        price_period=price_period,
        district=listing.district,
        gps_lat=listing.gps_lat,
        gps_lng=listing.gps_lng,
        cover_url=cover.url if cover else None,
        secondary_url=secondary.url if secondary else None,
        rating=None,        # populated from Review aggregations in Sprint 4
        review_count=0,
        bedroom_count=_as_int(type_data.get("bedroom_count")),
        bathroom_count=_as_float(type_data.get("bathroom_count")),
        drive_min_nile=_as_int(type_data.get("drive_min_nile")),
    )


async def _paginate(
    db: AsyncSession, stmt, *, category: SearchScope, page: int, page_size: int
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
    # _summarise derives the card price from unit types for off-campus.
    stmt = stmt.options(selectinload(Listing.unit_types))
    # Same reason the card price comes from unit types: Listing.price is null
    # here, so the shared range must compare against the cheapest unit.
    unit_price = _off_campus_price()
    stmt = _apply_shared(stmt, filters, price_col=unit_price)

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
        # A listing matches if any unit type is Gender.ANY (self-contain — no
        # tag) or matches the seeker's gender.
        subq = (
            select(UnitType.listing_id)
            .where(UnitType.gender_tag.in_((filters.gender, Gender.ANY)))
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

    stmt = _sort(stmt, filters.sort, price_col=unit_price)
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


async def search_all(filters: AllFilters, *, db: AsyncSession) -> SearchResponse:
    """Cross-category search behind the explore page's "All" scope.

    Only the category-agnostic filters apply. A price range is not one of them:
    rent quotes annually, short-let nightly, and sales outright, so a single
    range would silently mean something different in each lane — see
    ``AllFilters``. Price sorting is likewise dropped to the default ordering.
    """
    stmt = _base_visibility_stmt()
    # Off-campus rows can appear here and _summarise reads their unit types to
    # derive a "from" price.
    stmt = stmt.options(selectinload(Listing.unit_types))
    stmt = _apply_shared(stmt, filters, apply_price=False)

    sort = filters.sort
    if sort in ("price_asc", "price_desc"):
        sort = "relevance"
    stmt = _sort(stmt, sort)
    return await _paginate(
        db, stmt, category="all", page=filters.page, page_size=filters.page_size
    )


async def list_locations(
    *, db: AsyncSession, category: SearchScope = "all"
) -> list[LocationOption]:
    """Districts that currently hold visible listings, most inventory first.

    Backs the location typeahead. Reading it from live listings rather than the
    static Abuja vocabulary means the picker can only ever offer a district
    that returns results.
    """
    stmt = (
        select(Listing.district, func.count().label("count"))
        .where(Listing.status.not_in(_HIDDEN_STATUSES))
        .where(Listing.district.is_not(None))
        .where(func.trim(Listing.district) != "")
        .group_by(Listing.district)
        .order_by(func.count().desc(), Listing.district.asc())
    )
    if category != "all":
        stmt = stmt.where(Listing.category == category)
    rows = (await db.execute(stmt)).all()
    return [LocationOption(district=row[0], count=int(row[1])) for row in rows]
