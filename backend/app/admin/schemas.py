"""Pydantic schemas for the admin portal."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.listings.schemas import ListingDocumentView, ListingPhotoView
from app.models._enums import BadgeType, InspectionReportStatus, ListingCategory, ListingStatus


class DocReviewQueueRow(BaseModel):
    listing_id: str
    title: str
    category: ListingCategory
    landlord_name: str
    landlord_id: str
    submitted_at: datetime
    document_count: int


class DocReviewQueue(BaseModel):
    items: list[DocReviewQueueRow]
    total: int


class DocReviewActionPayload(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class AdminListingRow(BaseModel):
    id: str
    title: str | None
    category: ListingCategory
    status: ListingStatus
    landlord_id: str
    landlord_name: str
    created_at: datetime
    suspended_at: datetime | None = None
    deleted_at: datetime | None = None


class AdminListingsResponse(BaseModel):
    items: list[AdminListingRow]
    total: int
    page: int
    page_size: int


class AdminBadgeView(BaseModel):
    id: str
    type: BadgeType
    issued_at: datetime
    expires_at: datetime
    inspector_id: str | None = None


class AdminListingInspectionSummary(BaseModel):
    report_id: str
    status: InspectionReportStatus
    inspector_name: str
    submitted_at: datetime | None = None
    reviewed_at: datetime | None = None


class AdminListingDetail(BaseModel):
    id: str
    title: str | None = None
    subtitle: str | None = None
    description: str | None = None
    category: ListingCategory
    status: ListingStatus
    landlord_id: str
    landlord_name: str
    landlord_email: str
    created_at: datetime
    updated_at: datetime
    suspended_at: datetime | None = None
    deleted_at: datetime | None = None
    review_note: str | None = None
    suspension_reason: str | None = None
    address_line: str | None = None
    district: str | None = None
    gps_lat: float | None = None
    gps_lng: float | None = None
    price: float | None = None
    amenities: dict = Field(default_factory=dict)
    type_data: dict = Field(default_factory=dict)
    photos: list[ListingPhotoView] = Field(default_factory=list)
    documents: list[ListingDocumentView] = Field(default_factory=list)
    document_badge: AdminBadgeView | None = None
    physical_badge: AdminBadgeView | None = None
    latest_inspection: AdminListingInspectionSummary | None = None
    is_publicly_visible: bool = False


class AdminListingFilters(BaseModel):
    status: list[ListingStatus] | None = None
    category: list[ListingCategory] | None = None
    q: str | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class SuspendPayload(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class AdminListingEditPayload(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    subtitle: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=20_000)
    district: str | None = Field(default=None, max_length=100)
    price: float | None = Field(default=None, ge=0)


class DocumentPresignedView(BaseModel):
    url: str
    expires_in_seconds: int = 15 * 60
    filename: str
    doc_type: str
    content_type: str


class AuditLogEntry(BaseModel):
    id: str
    admin_id: str
    entity_type: str
    entity_id: str
    action: str
    payload: dict
    created_at: datetime


class AreaScoreView(BaseModel):
    cell_lat: float | None = None
    cell_lng: float | None = None
    road_condition: int | None = None
    electricity_supply_hours: int | None = None
    security: int | None = None
    proximity: int | None = None
    last_assessed_at: datetime | None = None


class AreaScoreUpdatePayload(BaseModel):
    road_condition: int | None = Field(default=None, ge=1, le=5)
    electricity_supply_hours: int | None = Field(default=None, ge=0, le=24)
    security: int | None = Field(default=None, ge=1, le=5)
    proximity: int | None = Field(default=None, ge=1, le=5)

    @model_validator(mode="after")
    def _require_one_field(self) -> "AreaScoreUpdatePayload":
        if all(
            value is None
            for value in (
                self.road_condition,
                self.electricity_supply_hours,
                self.security,
                self.proximity,
            )
        ):
            raise ValueError("At least one score must be provided.")
        return self


class NinReviewQueueRow(BaseModel):
    user_id: str
    full_name: str
    email: str
    role: str
    account_type: str | None = None
    nin_document_url: str
    uploaded_at: datetime


class NinReviewQueue(BaseModel):
    items: list[NinReviewQueueRow]
    total: int


class NinReviewRejectPayload(BaseModel):
    note: str = Field(..., min_length=1, max_length=2000)


class InspectionReviewQueueRow(BaseModel):
    report_id: str
    listing_id: str
    listing_title: str
    category: ListingCategory
    inspector_name: str
    landlord_name: str
    submitted_at: datetime | None = None
    status: InspectionReportStatus


class InspectionReviewQueue(BaseModel):
    items: list[InspectionReviewQueueRow]
    total: int


class InspectionEvidenceView(BaseModel):
    filename: str
    content_type: str
    captured_at: str
    gps_lat: float | None = None
    gps_lng: float | None = None
    note: str | None = None
    url: str | None = None


class InspectionReviewDetail(BaseModel):
    report_id: str
    listing_id: str
    listing_title: str
    category: ListingCategory
    status: InspectionReportStatus
    inspector_name: str
    landlord_name: str
    submitted_at: datetime | None = None
    inspector_note: str | None = None
    review_note: str | None = None
    address_line: str | None = None
    district: str | None = None
    visit_gps_lat: float | None = None
    visit_gps_lng: float | None = None
    assessment: dict
    evidence: list[InspectionEvidenceView]
    area_score: AreaScoreView | None = None
