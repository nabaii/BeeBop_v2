"""Pydantic schemas for listing creation, editing, photo and document
management, and category-specific structured data."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models._enums import Gender, ListingCategory, ListingStatus, UnitKind

# Amenity groups per product brief / dev plan. Fixed UI copy — changes
# require a code change + migration-safe backfill (rare).
#
# The "features" group holds lifestyle highlights a landlord can star to
# surface as headline tiles on the listing detail page (see the `featured`
# flag carried in each amenity's meta object). Unlike the utility groups it
# is purely promotional — order here is the order shown in the checklist.
AMENITY_GROUPS: dict[str, list[str]] = {
    "features": [
        "swimming_pool",
        "gym",
        "air_conditioning",
        "balcony",
        "garden",
        "elevator",
        "study_lounge",
        "pet_friendly",
        "rooftop_access",
        "smart_home",
    ],
    "power": ["generator", "solar", "inverter", "estate_grid", "prepaid_meter"],
    "water": ["borehole", "running_water", "water_treatment", "tank"],
    "security": ["gated_estate", "cctv", "perimeter_fence", "security_guards"],
    "internet": ["fibre_available", "wifi_included"],
    "parking": ["private_parking", "shared_parking", "gated_parking"],
    "kitchen": ["fitted_cabinets", "gas_cooker", "fridge", "microwave"],
    "laundry": ["washing_machine", "dryer", "external_line"],
}

# House rules a landlord can attach to a student-accommodation listing. Checked
# like amenities and individually featurable. Fixed UI copy — the frontend
# `lib/house-rules.ts` constant mirrors these keys for labels/icons.
HOUSE_RULES: list[str] = [
    "curfew",
    "no_smoking",
    "no_alcohol",
    "no_pets",
    "no_overnight_guests",
    "no_parties_loud_music",
    "visitors_sign_in",
    "keep_common_areas_clean",
]

# Rules that carry a free-text value (e.g. curfew time "11:00 PM"). Others are
# boolean only.
HOUSE_RULES_WITH_VALUE: set[str] = {"curfew"}


class ListingCreatePayload(BaseModel):
    """Minimal bootstrap payload. Category fixes downstream validation."""

    category: ListingCategory


class ListingDraftPayload(BaseModel):
    """Partial update — any field may be omitted. Draft auto-save sends this
    on every field change; we merge into the existing record.
    """

    title: str | None = Field(default=None, max_length=200)
    subtitle: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=20_000)
    address_line: str | None = Field(default=None, max_length=500)
    district: str | None = Field(default=None, max_length=100)
    gps_lat: float | None = Field(default=None, ge=-90, le=90)
    gps_lng: float | None = Field(default=None, ge=-180, le=180)
    price: float | None = Field(default=None, ge=0)
    amenities: dict | None = None
    type_data: dict | None = None

    @field_validator("amenities")
    @classmethod
    def _validate_amenities(cls, v: dict | None) -> dict | None:
        if v is None:
            return v
        # Every group key in the payload must be a known group; each group
        # must be either None (not-yet-set) or a flat object mapping amenity
        # key -> {"present": bool, "confirmed": bool}.
        for group, items in v.items():
            if group not in AMENITY_GROUPS:
                raise ValueError(f"Unknown amenity group: {group}")
            if items is None:
                continue
            if not isinstance(items, dict):
                raise ValueError(f"Amenity group {group} must be an object.")
            allowed = set(AMENITY_GROUPS[group])
            for key in items.keys():
                if key not in allowed:
                    raise ValueError(f"Unknown amenity in {group}: {key}")
        return v


class ListingPhotoView(BaseModel):
    """One gallery asset. `media_kind` tells the client which element to render."""

    id: str
    url: str
    media_kind: str = "image"
    # Video only — still frame to show before playback, and the clip length
    # used for the "Watch tour · 0:48" affordance.
    poster_url: str | None = None
    duration_seconds: int | None = None
    room_label: str | None = None
    is_cover: bool
    display_order: int
    # Owning unit type for off-campus room galleries; null = property gallery.
    unit_type_id: str | None = None


class ListingDocumentView(BaseModel):
    id: str
    filename: str
    doc_type: str
    content_type: str
    size_bytes: int | None = None


class RoomView(BaseModel):
    id: str
    name: str
    beds_total: int
    beds_available: int


class UnitTypeView(BaseModel):
    id: str
    name: str
    kind: UnitKind
    beds_per_room: int
    total_units: int
    price: float
    price_period: str
    gender_tag: Gender
    amenities: list[str] = Field(default_factory=list)
    rooms: list[RoomView] = Field(default_factory=list)
    # This unit type's own gallery, ordered by display_order.
    photos: list[ListingPhotoView] = Field(default_factory=list)
    # At most one room tour — see MAX_VIDEOS_PER_UNIT_GALLERY.
    videos: list[ListingPhotoView] = Field(default_factory=list)


class ListingView(BaseModel):
    id: str
    owner_id: str
    category: ListingCategory
    status: ListingStatus
    title: str | None = None
    subtitle: str | None = None
    description: str | None = None
    address_line: str | None = None
    district: str | None = None
    gps_lat: float | None = None
    gps_lng: float | None = None
    amenities: dict = Field(default_factory=dict)
    price: float | None = None
    type_data: dict = Field(default_factory=dict)
    photos: list[ListingPhotoView] = Field(default_factory=list)
    # Property-gallery video tours, managed as their own group in the editor.
    videos: list[ListingPhotoView] = Field(default_factory=list)
    documents: list[ListingDocumentView] = Field(default_factory=list)
    unit_types: list[UnitTypeView] = Field(default_factory=list)


# -----------------------------------------------------------------------------
# Photo management
# -----------------------------------------------------------------------------


class PhotoUploadSignatureResponse(BaseModel):
    """Cloudinary signed upload — browser posts directly to Cloudinary."""

    cloud_name: str
    api_key: str
    timestamp: int
    signature: str
    folder: str


class PhotoRegisterPayload(BaseModel):
    """Called by the browser after a successful Cloudinary upload.

    The video fields are echoed straight from Cloudinary's upload response.
    They are not trusted: `app.listings.service.register_photo` re-checks them
    against the duration, size, format and per-gallery count caps before the
    row is written.
    """

    url: str = Field(..., max_length=500)
    media_kind: Literal["image", "video"] = "image"
    room_label: str | None = Field(default=None, max_length=100)
    # Off-campus: file the photo under a unit type's gallery instead of the
    # property gallery. Must belong to this listing.
    unit_type_id: uuid.UUID | None = None

    # Cloudinary `public_id` — kept so poster/quality transforms can be derived.
    provider_public_id: str | None = Field(default=None, max_length=300)
    poster_url: str | None = Field(default=None, max_length=500)
    duration_seconds: int | None = Field(default=None, ge=0)
    size_bytes: int | None = Field(default=None, ge=0)
    # Cloudinary `format`, e.g. "mp4" / "mov".
    video_format: str | None = Field(default=None, max_length=16)


class PhotoUpdatePayload(BaseModel):
    room_label: str | None = Field(default=None, max_length=100)
    is_cover: bool | None = None


class PhotoReorderPayload(BaseModel):
    """Ordered list of photo IDs — index == display_order.

    Ordering is per gallery *and* per media kind: the list must name every
    asset of `media_kind` in the targeted gallery (the property gallery, or one
    unit type's) and nothing else. Photos and videos render as separate groups,
    so each drags independently.
    """

    photo_ids: list[str]
    unit_type_id: uuid.UUID | None = None
    media_kind: Literal["image", "video"] = "image"


# -----------------------------------------------------------------------------
# Document management
# -----------------------------------------------------------------------------


class DocumentUploadSignaturePayload(BaseModel):
    filename: str = Field(..., max_length=300)
    content_type: Literal[
        "application/pdf",
        "image/jpeg",
        "image/png",
    ]
    doc_type: Literal[
        "c_of_o",
        "deed_of_assignment",
        "governors_consent",
        "tenancy_agreement",
        "receipt",
        "other",
    ]
    size_bytes: int | None = Field(default=None, ge=0, le=25 * 1024 * 1024)


class DocumentUploadSignatureResponse(BaseModel):
    url: str
    key: str
    headers: dict[str, str]


class DocumentRegisterPayload(BaseModel):
    s3_key: str = Field(..., max_length=500)
    filename: str = Field(..., max_length=300)
    doc_type: str = Field(..., max_length=64)
    content_type: str = Field(..., max_length=100)
    size_bytes: int | None = Field(default=None, ge=0)


# -----------------------------------------------------------------------------
# Student accommodation inventory
# -----------------------------------------------------------------------------


class UnitTypePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    kind: UnitKind
    beds_per_room: int = Field(..., ge=1, le=8)
    total_units: int = Field(..., ge=1, le=500)
    price: float = Field(..., ge=0)
    # Billing period the price covers — shown next to every off-campus price.
    price_period: Literal["year", "semester"] = "year"
    # Sex served by this unit type. Self-contain units are normalised to ANY
    # server-side; shared units require female or male.
    gender_tag: Literal[Gender.FEMALE, Gender.MALE, Gender.ANY] = Gender.ANY
    amenities: list[str] = Field(default_factory=list)


class RoomPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    beds_total: int = Field(..., ge=1, le=8)


class RoomUpdatePayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    beds_total: int | None = Field(default=None, ge=1, le=8)
    beds_available: int | None = Field(default=None, ge=0, le=8)


# -----------------------------------------------------------------------------
# Short-let pricing and availability
# -----------------------------------------------------------------------------


class ShortLetPricingPayload(BaseModel):
    base_rate: float = Field(..., gt=0)
    weekend_rate: float | None = Field(default=None, gt=0)
    min_stay_nights: int = Field(default=1, ge=1, le=90)
    turnaround_days: int = Field(default=0, ge=0, le=7)
    instant_booking: bool = False


# -----------------------------------------------------------------------------
# Category-specific type_data validators (applied at submit-time)
# -----------------------------------------------------------------------------


class RentTypeData(BaseModel):
    bedroom_count: int = Field(..., ge=0, le=20)
    property_type: Literal[
        "flat", "detached", "semi_detached", "terraced", "bq", "mini_flat", "self_contain"
    ]
    furnishing: Literal["furnished", "semi_furnished", "unfurnished"]
    payment_structure: Literal["annual", "two_years_upfront"]
    available_from: date


class SalesTypeData(BaseModel):
    bedroom_count: int | None = Field(default=None, ge=0, le=50)
    property_type: Literal[
        "flat",
        "detached",
        "semi_detached",
        "terraced",
        "land_only",
        "commercial",
    ]
    development_status: Literal["ready", "off_plan", "under_construction"]
    title_type: Literal["c_of_o", "governors_consent", "deed_of_assignment", "leasehold"]


class HouseRuleEntry(BaseModel):
    """A single house rule's state on a listing. `featured` mirrors the amenity
    star (surfaced as a tile on the public page); `value` holds the free-text
    detail for valued rules like curfew ("11:00 PM")."""

    present: bool = False
    featured: bool = False
    value: str | None = Field(default=None, max_length=50)


class OffCampusTypeData(BaseModel):
    institutions_accepted: list[str] = Field(default_factory=list)
    # Optional house rules / code of conduct, uploaded by the landlord as a PDF
    # to Cloudinary (publicly viewable by seekers). URL + original filename.
    rules_doc_url: str | None = Field(default=None, max_length=500)
    rules_doc_name: str | None = Field(default=None, max_length=300)
    # Manually-recorded driving time (minutes) to the campuses BeeBop serves.
    # Set by the landlord at onboarding and/or overridden by an admin. Optional —
    # never gates submission. Capped at 600 min to reject obvious typos.
    drive_min_nile: int | None = Field(default=None, ge=0, le=600)
    drive_min_baze: int | None = Field(default=None, ge=0, le=600)
    # Checkable house rules, keyed by HOUSE_RULES. Featurable like amenities.
    house_rules: dict[str, HouseRuleEntry] | None = None
    # Payment structure is per-unit-type — captured on the UnitType record,
    # not here.

    @field_validator("house_rules")
    @classmethod
    def _validate_house_rules(
        cls, v: dict[str, HouseRuleEntry] | None
    ) -> dict[str, HouseRuleEntry] | None:
        if v is None:
            return v
        for key in v:
            if key not in HOUSE_RULES:
                raise ValueError(f"Unknown house rule: {key}")
        return v


class ListingDeletePayload(BaseModel):
    password: str | None = None

