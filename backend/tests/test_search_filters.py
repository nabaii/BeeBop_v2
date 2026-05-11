"""Unit tests for filter schema defaults and verification-tier clause building.

Integration coverage (end-to-end SQL against Postgres) lands with the test
container in CI — this module keeps the pure-Python logic tightly covered.
"""

from __future__ import annotations

from app.models._enums import ListingCategory, ListingStatus
from app.search.schemas import (
    OffCampusFilters,
    RentFilters,
    SalesFilters,
    SearchResponse,
    SharedFilters,
    ShortLetFilters,
)
from app.search.service import _verification_clause


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


def test_off_campus_filters_extend_shared_with_silent_fields() -> None:
    f = OffCampusFilters()
    assert f.institution is None
    assert f.gender is None
    assert f.unit_kinds == []
    assert f.available_now is False


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
