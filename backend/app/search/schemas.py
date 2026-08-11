"""Search request / response schemas."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.models._enums import Gender, ListingCategory, ListingStatus

VerificationTier = Literal["fully_verified", "doc_verified", "unverified"]

SortOption = Literal[
    "relevance",
    "price_asc",
    "price_desc",
    "newest",
    "highest_rated",
]

# The explore surface can search across every lane at once. "all" is a search
# scope, not a listing category — no listing is ever stored with it.
SearchScope = ListingCategory | Literal["all"]


class SharedFilters(BaseModel):
    """Every category shares these."""

    q: str | None = None
    locations: list[str] = Field(default_factory=list)
    verification: list[VerificationTier] = Field(
        default_factory=lambda: ["fully_verified", "doc_verified", "unverified"]
    )
    amenities: list[str] = Field(default_factory=list)  # format: "group:key"
    min_price: float | None = Field(default=None, ge=0)
    max_price: float | None = Field(default=None, ge=0)
    sort: SortOption = "relevance"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=24, ge=1, le=60)


Campus = Literal["nile", "baze"]


class OffCampusFilters(SharedFilters):
    use_profile_filters: bool = False
    institution: str | None = None
    gender: Gender | None = None
    unit_kinds: list[str] = Field(default_factory=list)
    available_now: bool = False
    # Drive-time filter. `campus` selects which recorded time to compare
    # (type_data.drive_min_nile / drive_min_baze); `max_drive_min` is the cap.
    # Listings with no recorded time for that campus are excluded — an unknown
    # commute cannot be shown to satisfy "within 20 minutes".
    campus: Campus | None = None
    max_drive_min: int | None = Field(default=None, ge=1, le=600)
    # Opt back in to the listings the cap excludes for lack of data. The drive
    # time is optional for landlords, so a strict cap can hide a place that is
    # in fact next door — this lets the seeker decide, once the response has
    # told them how many are affected (`hidden_unknown_drive`).
    include_unknown_drive: bool = False
    # House rules a seeker wants to avoid, keyed by HOUSE_RULES. Exclusion only:
    # every rule in the vocabulary is a restriction, so the useful question is
    # "don't show me anywhere with a curfew", never the reverse.
    exclude_house_rules: list[str] = Field(default_factory=list)


class ShortLetFilters(SharedFilters):
    check_in: date | None = None
    check_out: date | None = None
    min_stay: int | None = Field(default=None, ge=1)
    instant_booking: bool | None = None
    min_rating: float | None = Field(default=None, ge=0, le=5)
    # NOTE: no `guests` field. Short-let type_data carries base_rate,
    # weekend_rate, min_stay_nights, turnaround_days and instant_booking — no
    # guest capacity is recorded anywhere on a listing, so a guests filter
    # could only ever be decorative. Add the capacity field to
    # ShortLetPricingPayload first if this is wanted.


class RentFilters(SharedFilters):
    bedroom_counts: list[int] = Field(default_factory=list)
    min_bathrooms: int | None = Field(default=None, ge=1, le=10)
    property_types: list[str] = Field(default_factory=list)
    furnishing: list[str] = Field(default_factory=list)
    payment_structure: list[str] = Field(default_factory=list)
    available_from: date | None = None


class SalesFilters(SharedFilters):
    bedroom_counts: list[int] = Field(default_factory=list)
    min_bathrooms: int | None = Field(default=None, ge=1, le=10)
    property_types: list[str] = Field(default_factory=list)
    development_status: list[str] = Field(default_factory=list)
    title_types: list[str] = Field(default_factory=list)


class AllFilters(SharedFilters):
    """Cross-category explore search.

    Only the category-agnostic filters apply. ``min_price``/``max_price`` are
    inherited but deliberately ignored by the service: rent prices annually,
    short-let nightly, and sales outright, so one range spanning all three
    would silently mean three different things. The client hides the price
    control until a single category is chosen.
    """


class LocationOption(BaseModel):
    """A district that actually has visible inventory, with its listing count.

    Powers the location typeahead. Sourced from live listings rather than the
    static vocabulary so the picker can never offer a district that returns
    zero results.
    """

    district: str
    count: int


class PriceRange(BaseModel):
    """Cheapest and dearest visible listing in a lane.

    Bounds the price slider against real inventory instead of invented limits,
    so the track always spans something a seeker can actually reach. Both null
    when the lane has no priced listings — the client hides the slider rather
    than drawing an empty track.
    """

    min: float | None = None
    max: float | None = None


class PublicListingSummary(BaseModel):
    """Shape used on browse grids and map pins."""

    id: str
    category: ListingCategory
    status: ListingStatus
    title: str
    subtitle: str | None = None
    price: float | None = None
    district: str | None = None
    gps_lat: float | None = None
    gps_lng: float | None = None
    cover_url: str | None = None
    # First non-cover photo, when present — lets cards crossfade on hover to
    # double photo exposure without a click. Null for single-photo listings.
    secondary_url: str | None = None
    # Listing has at least one video tour, in any of its galleries. Drives the
    # card chip; the video itself is only ever played on the listing page.
    # False on surfaces that don't look it up (see `_summarise`).
    has_video: bool = False
    rating: float | None = None
    review_count: int = 0
    # Billing period for the price (off-campus only); e.g. "year" or "semester".
    price_period: str | None = None
    # Surfaced from type_data so cards show real specs instead of guesses.
    # Null when the listing does not record them (e.g. off-campus per-unit).
    bedroom_count: int | None = None
    bathroom_count: float | None = None
    # Off-campus: manually-recorded driving time (minutes) to Nile University,
    # featured on every student-accommodation card. Null when not recorded.
    drive_min_nile: int | None = None
    # Off-campus bed inventory, summed across the listing's rooms — the stat
    # students judge a place on first. Both null means "do not show": another
    # category, the landlord turned `show_availability` off, or no rooms are
    # recorded yet. Null is deliberately distinct from 0, which means full.
    # Suppression happens here rather than on the card so a landlord who opts
    # out doesn't have the numbers sitting in the JSON payload anyway.
    beds_available: int | None = None
    beds_total: int | None = None


class SearchResponse(BaseModel):
    # "all" when the cross-category explore search produced these rows; each
    # result still carries its own concrete category.
    category: SearchScope
    total: int
    page: int
    page_size: int
    results: list[PublicListingSummary]
    # Off-campus only, and only when a drive-time cap is active: how many
    # listings passed every other filter but were dropped because no drive time
    # to that campus is recorded. Zero everywhere else. Surfaced so the seeker
    # can see that a filter is hiding places for want of data rather than for
    # being too far away.
    hidden_unknown_drive: int = 0


class PublicRoom(BaseModel):
    id: str
    name: str
    beds_total: int
    beds_available: int


class PublicUnitTypePhoto(BaseModel):
    id: str
    url: str
    room_label: str | None = None
    is_cover: bool
    display_order: int


class PublicVideo(BaseModel):
    """A gallery video tour as shown to seekers.

    `poster_url` may be null for rows uploaded before poster derivation, so
    clients must be able to render without one.
    """

    id: str
    url: str
    poster_url: str | None = None
    duration_seconds: int | None = None
    room_label: str | None = None
    display_order: int


class PublicUnitType(BaseModel):
    """A student-accommodation unit type as shown to seekers — per-unit price,
    the sex it serves, its amenities, and aggregated bed availability across
    that unit's rooms."""

    id: str
    name: str
    kind: str
    price: float
    beds_per_room: int
    total_units: int
    price_period: str
    gender_tag: Gender
    amenities: list[str] = Field(default_factory=list)
    beds_total: int
    beds_available: int
    rooms: list[PublicRoom] = Field(default_factory=list)
    # This unit type's own gallery. Rooms differ between unit types, so seekers
    # compare the actual room rather than the building. Empty when the landlord
    # has not uploaded any — clients fall back to the property cover.
    photos: list[PublicUnitTypePhoto] = Field(default_factory=list)
    # This unit type's room tour — at most one.
    videos: list[PublicVideo] = Field(default_factory=list)


class PublicListingDetail(BaseModel):
    id: str
    category: ListingCategory
    status: ListingStatus
    title: str
    subtitle: str | None = None
    description: str
    district: str | None = None
    gps_lat: float | None = None
    gps_lng: float | None = None
    price: float | None = None
    # Billing period for the (off-campus starting) price; e.g. "year"/"semester".
    price_period: str | None = None
    amenities: dict
    type_data: dict
    photos: list[dict]
    # Property-gallery video tours, shown as their own group in the gallery.
    videos: list[PublicVideo] = Field(default_factory=list)
    # Off-campus only: per-unit pricing and bed availability. Empty for other
    # categories, which price on `price` above.
    unit_types: list[PublicUnitType] = Field(default_factory=list)
    area_score: "PublicAreaScore | None" = None
    # Valuation report lives in a separate object, gated at the API level
    # below. Clients that do not send a bearer token get `valuation_report=None`.
    valuation_report: "ValuationReport | None" = None
    is_bookmarked: bool = False
    rating: float | None = None
    review_count: int = 0


class PublicAreaScore(BaseModel):
    scores: dict | None = None
    last_assessed_at: str | None = None


class ValuationReport(BaseModel):
    """Gated panel shown on the listing page to signed-in users.

    Per v2.0 change: NO fair-market-value indicator and NO comparable listings.
    Only: area infrastructure scores, inspector professional note, report date.
    Generated by Claude at physical-badge issuance (Sprint 7); this Sprint 3
    schema is the consumer shape.
    """

    area_scores: dict | None = None
    area_scores_last_updated: str | None = None
    inspector_note: str | None = None
    report_date: str | None = None   # ISO-8601
