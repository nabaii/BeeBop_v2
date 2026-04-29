"""Pydantic schemas for the trusted-agent portal."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models._enums import ListingCategory, VisitCancelledBy, VisitStatus


class AgentInvitePayload(BaseModel):
    email: str
    phone: str | None = None
    first_name: str
    last_name: str


class AgentInviteResponse(BaseModel):
    user_id: str
    email: str
    invitation_sent: bool


class AgentVisitRow(BaseModel):
    visit_id: str
    listing_id: str
    listing_title: str
    listing_category: ListingCategory
    address_district: str | None = None
    listing_gps_lat: float | None = None
    listing_gps_lng: float | None = None
    seeker_first_name: str | None = None
    status: VisitStatus
    assigned_at: datetime | None = None
    agent_confirmation_deadline: datetime | None = None
    scheduled_at: datetime | None = None
    visit_report_submitted_at: datetime | None = None


class AgentBriefingPack(BaseModel):
    visit_id: str
    listing_id: str
    listing_title: str
    listing_category: ListingCategory
    address_line: str | None = None
    district: str | None = None
    listing_gps_lat: float | None = None
    listing_gps_lng: float | None = None
    listing_photos: list[dict]
    listed_amenities: dict
    seeker_first_name: str | None = None
    verification_status: str
    conduct_reminders: list[str]


class ConfirmAssignmentPayload(BaseModel):
    """Agent confirms or flags a conflict within the 2-hour window."""

    confirmed: bool
    scheduled_at: datetime | None = None      # required when confirmed=True
    conflict_reason: str | None = Field(default=None, max_length=500)


class AmenityObservation(BaseModel):
    key: str
    listed: Literal["present", "absent"]
    observed: Literal["present", "not_confirmed", "absent"]


class PostVisitReportPayload(BaseModel):
    visit_occurred: bool
    access_issues: bool = False
    access_notes: str | None = Field(default=None, max_length=1_000)
    conduct_issues: bool = False
    conduct_notes: str | None = Field(default=None, max_length=1_000)
    amenity_observations: list[AmenityObservation] = Field(default_factory=list)
    discrepancies: str | None = Field(default=None, max_length=2_000)
    free_text_observations: str | None = Field(default=None, max_length=4_000)


class CancelVisitPayload(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class VisitReviewActionPayload(BaseModel):
    note: str | None = Field(default=None, max_length=2_000)


class VisitReportReviewQueueRow(BaseModel):
    visit_id: str
    listing_id: str
    listing_title: str
    listing_category: ListingCategory
    seeker_first_name: str | None = None
    agent_id: str
    agent_name: str
    submitted_at: datetime | None = None
    status: VisitStatus


class VisitReportReviewDetail(BaseModel):
    visit_id: str
    listing_id: str
    listing_title: str
    listing_category: ListingCategory
    status: VisitStatus
    seeker_first_name: str | None = None
    agent_name: str
    submitted_at: datetime | None = None
    visit_report: dict | None = None
    cancelled_by: VisitCancelledBy | None = None
    cancellation_reason: str | None = None
    review_note: str | None = None
