"""Pydantic schemas for listing creation, editing, photo and document
management, and category-specific structured data."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models._enums import Gender, ListingCategory, ListingStatus, UnitKind

# Amenity groups per product brief / dev plan. Fixed UI copy — changes
# require a code change + migration-safe backfill (rare).
AMENITY_GROUPS: dict[str, list[str]] = {
    "power": ["generator", "solar", "inverter", "estate_grid", "prepaid_meter"],
    "water": ["borehole", "running_water", "water_treatment", "tank"],
    "security": ["gated_estate", "cctv", "perimeter_fence", "security_guards"],
    "internet": ["fibre_available", "wifi_included"],
    "parking": ["private_parking", "shared_parking", "gated_parking"],
    "kitchen": ["fitted_cabinets", "gas_cooker", "fridge", "microwave"],
    "laundry": ["washing_machine", "dryer", "external_line"],
}


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
    id: str
    url: str
    room_label: str | None = None
    is_cover: bool
    display_order: int


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
    """Called by the browser after a successful Cloudinary upload."""

    url: str = Field(..., max_length=500)
    room_label: str | None = Field(default=None, max_length=100)


class PhotoUpdatePayload(BaseModel):
    room_label: str | None = Field(default=None, max_length=100)
    is_cover: bool | None = None


class PhotoReorderPayload(BaseModel):
    """Ordered list of photo IDs — index == display_order."""

    photo_ids: list[str]


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
    price_period: Literal["year", "session"] = "year"
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


class OffCampusTypeData(BaseModel):
    institutions_accepted: list[str] = Field(default_factory=list)
    # Payment structure is per-unit-type — captured on the UnitType record,
    # not here. This block is reserved for future shared off-campus metadata
    # (e.g. "self_contain_available": bool, "rules": list[str]).


class ListingDeletePayload(BaseModel):
    password: str | None = None

