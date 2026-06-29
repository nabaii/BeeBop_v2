"""Visit schemas — admin queue, agent assignment, and seeker requests."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

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


class RequestVisitPayload(BaseModel):
    """Seeker self-requests a property visit. At least two preferred dates so
    the assigned trusted agent has scheduling flexibility."""

    preferred_dates: list[date] = Field(..., min_length=2, max_length=5)

    @model_validator(mode="after")
    def _validate_dates(self) -> "RequestVisitPayload":
        unique = sorted(set(self.preferred_dates))
        if len(unique) < 2:
            raise ValueError("Pick at least two different dates.")
        if unique[0] < date.today():
            raise ValueError("Preferred dates must be today or later.")
        self.preferred_dates = unique
        return self


class SeekerVisitView(BaseModel):
    visit_id: str
    listing_id: str
    listing_title: str
    status: VisitStatus
    preferred_dates: list[date]
    scheduled_at: datetime | None = None
    created_at: datetime
