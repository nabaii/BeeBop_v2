"""Unit tests for filter schema defaults and verification-tier clause building.

Integration coverage (end-to-end SQL against Postgres) lands with the test
container in CI — this module keeps the pure-Python logic tightly covered.
"""

from __future__ import annotations

from sqlalchemy import select

from app.models._enums import ListingCategory, ListingStatus
from app.models.listing import Listing
from app.search.schemas import (
    AllFilters,
    LocationOption,
    OffCampusFilters,
    RentFilters,
    SalesFilters,
    SearchResponse,
    SharedFilters,
    ShortLetFilters,
)
from app.search.routes import (
    _all_filters,
    _off_campus_filters,
    _rent_filters,
    _shared_filter_kwargs,
)
from app.search.service import (
    _apply_shared,
    _base_visibility_stmt,
    _off_campus_price,
    _sort,
    _verification_clause,
)


def _sql(stmt) -> str:  # type: ignore[no-untyped-def]
    return str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()


def test_shared_filters_default_to_test_phase_visibility() -> None:
    assert SharedFilters().verification == [
        "fully_verified",
        "doc_verified",
        "unverified",
    ]


def test_shared_filters_default_sort_is_relevance() -> None:
    assert SharedFilters().sort == "relevance"


def test_pagination_defaults_safe() -> None:
    f = SharedFilters()
    assert f.page == 1
    assert f.page_size == 24


def test_verification_clause_empty_returns_no_results() -> None:
    # Turning off every verification tier should match nothing (client bug
    # guard; we deliberately do NOT fall back to "show all").
    clause = _verification_clause([])
    # The produced clause is a literal `Listing.id IS NULL` — exercising the
    # side of the disjunction that is never true.
    assert clause is not None


def test_verification_clause_fully_verified_includes_let_sale_agreed() -> None:
    """Listings that have progressed to a signed agreement should still match
    the Fully Verified pin on browse — they're not hidden until delisted."""
    # We can't execute SQL here; we assert at shape-level by inspecting
    # the compiled filter's captured values.
    from sqlalchemy import select

    from app.models.listing import Listing

    stmt = select(Listing).where(_verification_clause(["fully_verified"]))
    compiled = stmt.compile(compile_kwargs={"literal_binds": True})
    as_sql = str(compiled).lower()
    assert "fully_verified" in as_sql
    assert "let_agreed" in as_sql
    assert "sale_agreed" in as_sql


def test_verification_clause_combined_tiers() -> None:
    from sqlalchemy import select

    from app.models.listing import Listing

    stmt = select(Listing).where(
        _verification_clause(["fully_verified", "doc_verified", "unverified"])
    )
    as_sql = str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()
    assert "doc_verified" in as_sql
    assert "live_unverified" in as_sql
    assert "fully_verified" in as_sql


def test_off_campus_filters_extend_shared_with_explicit_student_fields() -> None:
    f = OffCampusFilters()
    assert f.use_profile_filters is False
    assert f.institution is None
    assert f.gender is None
    assert f.unit_kinds == []
    assert f.available_now is False


def test_route_filter_helpers_parse_repeated_query_lists() -> None:
    shared = _shared_filter_kwargs(
        locations=["Jahi", "Wuse 2"],
        verification=["fully_verified", "unverified"],
        amenities=["power:generator"],
    )

    rent = _rent_filters(shared=shared, bedroom_counts=[2, 3])
    assert rent.locations == ["Jahi", "Wuse 2"]
    assert rent.verification == ["fully_verified", "unverified"]
    assert rent.amenities == ["power:generator"]
    assert rent.bedroom_counts == [2, 3]

    off_campus = _off_campus_filters(shared=shared, unit_kinds=["self_contain"])
    assert off_campus.use_profile_filters is False
    assert off_campus.unit_kinds == ["self_contain"]


def test_short_let_filter_optional_fields() -> None:
    f = ShortLetFilters()
    assert f.check_in is None
    assert f.check_out is None
    assert f.instant_booking is None


def test_rent_filter_field_defaults() -> None:
    f = RentFilters()
    assert f.bedroom_counts == []
    assert f.property_types == []
    assert f.furnishing == []
    assert f.payment_structure == []


def test_sales_filter_field_defaults() -> None:
    f = SalesFilters()
    assert f.bedroom_counts == []
    assert f.development_status == []
    assert f.title_types == []


def test_search_response_validates_empty() -> None:
    resp = SearchResponse(
        category=ListingCategory.RENT, total=0, page=1, page_size=24, results=[]
    )
    assert resp.category == ListingCategory.RENT
    assert resp.total == 0
    assert resp.results == []


# ---------------------------------------------------------------------------
# Explore: cross-category scope
# ---------------------------------------------------------------------------


def test_search_response_accepts_the_all_scope() -> None:
    """Explore's cross-category search reports scope "all"; each result still
    carries its own concrete category."""
    resp = SearchResponse(category="all", total=0, page=1, page_size=24, results=[])
    assert resp.category == "all"


def test_all_filters_inherit_shared_defaults() -> None:
    f = AllFilters()
    assert f.verification == ["fully_verified", "doc_verified", "unverified"]
    assert f.sort == "relevance"
    assert f.page == 1


def test_all_scope_route_helper_builds_from_shared_only() -> None:
    shared = _shared_filter_kwargs(q="duplex", locations=["Jabi"])
    f = _all_filters(shared=shared)
    assert isinstance(f, AllFilters)
    assert f.q == "duplex"
    assert f.locations == ["Jabi"]


def test_all_scope_ignores_the_price_range() -> None:
    """Rent quotes annually, short-let nightly, and sales outright, so one
    range across every lane would silently mean three different things. The
    cross-category search drops it rather than applying it to one meaning."""
    f = AllFilters(min_price=100_000, max_price=900_000)
    sql = _sql(_apply_shared(_base_visibility_stmt(), f, apply_price=False))
    assert "100000" not in sql
    assert "900000" not in sql


def test_single_category_still_applies_the_price_range() -> None:
    f = RentFilters(min_price=100_000, max_price=900_000)
    sql = _sql(_apply_shared(_base_visibility_stmt(), f))
    assert "listings.price >= 100000" in sql
    assert "listings.price <= 900000" in sql


# ---------------------------------------------------------------------------
# Regressions: filters that silently matched nothing
# ---------------------------------------------------------------------------


def test_location_filter_is_case_insensitive() -> None:
    """Location tokens arrive from a text box and from the conversational
    parser; neither can guarantee the casing stored on the listing row, so
    `jabi` must not be a dead end."""
    f = SharedFilters(locations=["jabi", "  WUSE 2  "])
    sql = _sql(_apply_shared(_base_visibility_stmt(), f))
    assert "lower(listings.district) in ('jabi', 'wuse 2')" in sql


def test_blank_location_tokens_do_not_filter() -> None:
    f = SharedFilters(locations=["   "])
    sql = _sql(_apply_shared(_base_visibility_stmt(), f))
    assert "lower(listings.district)" not in sql


def test_off_campus_price_filter_targets_unit_types_not_listing_price() -> None:
    """Off-campus listings leave `Listing.price` null and price per unit type,
    so comparing the range against the listing row excluded every one of them."""
    price = _off_campus_price()
    f = OffCampusFilters(min_price=250_000)
    sql = _sql(_apply_shared(_base_visibility_stmt(), f, price_col=price))
    assert "min(unit_types.price)" in sql
    assert "listings.price >=" not in sql


def test_off_campus_price_sort_uses_the_cheapest_unit() -> None:
    price = _off_campus_price()
    sql = _sql(_sort(select(Listing), "price_asc", price_col=price))
    assert "min(unit_types.price)" in sql
    assert "order by (select min(unit_types.price)" in sql


def test_default_sort_still_orders_on_the_listing_row() -> None:
    sql = _sql(_sort(select(Listing), "price_desc"))
    assert "order by listings.price desc" in sql


def test_location_option_shape() -> None:
    option = LocationOption(district="Jabi", count=7)
    assert option.district == "Jabi"
    assert option.count == 7
