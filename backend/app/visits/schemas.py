"""Visit schemas — admin queue and agent assignment."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models._enums import ListingCategory, VisitStatus


class VisitQueueRow(BaseModel):
    visit_id: str
    listing_id: str
    listing_title: str
    listing_category: ListingCategory
    district: str | None = None
    seeker_id: str
    seeker_first_name: str | None = None
    offer_id: str | None = None
    status: VisitStatus
    created_at: datetime
    assigned_at: datetime | None = None
    agent_confirmation_deadline: datetime | None = None
    assigned_agent_id: str | None = None
    assigned_agent_name: str | None = None


class AvailableAgent(BaseModel):
    id: str
    name: str
    operating_area: str | None = None


class AssignAgentPayload(BaseModel):
    agent_id: str = Field(..., min_length=1)
