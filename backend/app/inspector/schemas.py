"""Inspector portal schemas — invitation, activation, assignments, reports."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models._enums import InspectionReportStatus, ListingCategory


class InspectorInvitePayload(BaseModel):
    email: str
    phone: str | None = None
    first_name: str
    last_name: str

    @field_validator("email")
    @classmethod
    def _normalise_email(cls, v: str) -> str:
        return v.strip().lower()


class InspectorInviteResponse(BaseModel):
    user_id: str
    email: str
    invitation_sent: bool


class ConductAckPayload(BaseModel):
    acknowledged: Literal[True]


class AssignmentRow(BaseModel):
    report_id: str
    listing_id: str
    listing_title: str
    listing_category: ListingCategory
    address_district: str | None
    listing_gps_lat: float | None
    listing_gps_lng: float | None
    status: InspectionReportStatus
    assigned_at: datetime | None
    submitted_at: datetime | None


class BriefingPack(BaseModel):
    """All the context an inspector needs before a visit."""

    report_id: str
    listing_id: str
    listing_title: str
    listing_subtitle: str | None
    listing_category: ListingCategory
    description: str | None
    district: str | None
    address_line: str | None
    listing_gps_lat: float | None
    listing_gps_lng: float | None
    cover_photo_url: str | None
    listing_photos: list[dict]
    listed_amenities: dict
    seeker_first_name: str | None = None      # populated when this report is tied to a visit (Sprint 9)


class ReportView(BaseModel):
    id: str
    listing_id: str
    inspector_id: str
    status: InspectionReportStatus
    assessment: dict
    evidence: list[dict]
    visit_gps_lat: float | None = None
    visit_gps_lng: float | None = None
    inspector_note: str | None = None
    submitted_at: datetime | None = None
    review_note: str | None = None


class ReportDraftPayload(BaseModel):
    """Partial save during fieldwork. Every field is optional so the form
    can sync any subset captured on-site."""

    assessment: dict | None = None
    inspector_note: str | None = Field(default=None, max_length=10_000)
    visit_gps_lat: float | None = Field(default=None, ge=-90, le=90)
    visit_gps_lng: float | None = Field(default=None, ge=-180, le=180)
    # Area-cell scores stored separately (see /infrastructure-score).


class InfrastructureScorePayload(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    road_condition: int | None = Field(default=None, ge=1, le=5)
    electricity_supply_hours: int | None = Field(default=None, ge=0, le=24)
    security: int | None = Field(default=None, ge=1, le=5)
    proximity: int | None = Field(default=None, ge=1, le=5)
    landmarks: list[dict] | None = None


class EvidenceUploadSignaturePayload(BaseModel):
    filename: str = Field(..., max_length=300)
    content_type: Literal[
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/quicktime",
    ]
    captured_at: datetime
    gps_lat: float | None = Field(default=None, ge=-90, le=90)
    gps_lng: float | None = Field(default=None, ge=-180, le=180)
    size_bytes: int | None = Field(default=None, ge=0, le=100 * 1024 * 1024)


class EvidenceUploadSignatureResponse(BaseModel):
    url: str
    s3_key: str
    headers: dict[str, str]


class EvidenceRegisterPayload(BaseModel):
    s3_key: str
    filename: str
    content_type: str
    captured_at: datetime
    gps_lat: float | None = None
    gps_lng: float | None = None
    note: str | None = Field(default=None, max_length=300)


class AssignmentCreatePayload(BaseModel):
    """Admin payload — assign an inspector to a listing."""

    listing_id: str
    inspector_id: str
