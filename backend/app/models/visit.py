"""Visit requests and confirmed agent-led visits.

Created automatically when an offer is accepted on a listing where no visit
has yet been conducted. Admin assigns a trusted agent from the visit queue;
the agent has 2 hours to confirm or flag a conflict (per dev plan §8.4).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._enums import VisitCancelledBy, VisitStatus
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Visit(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "visits"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    seeker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    # The accepted offer that triggered this visit. NULL when admin schedules
    # a pre-offer site visit (rare; manual workflow).
    offer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offers.id", ondelete="SET NULL")
    )

    status: Mapped[VisitStatus] = mapped_column(
        Enum(VisitStatus, name="visit_status", values_callable=lambda x: [e.value for e in x]),
        default=VisitStatus.PENDING_ASSIGNMENT,
        nullable=False,
        index=True,
    )

    # Admin assignment.
    assigned_agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    assigned_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    # Agent has 2 hours to confirm. We persist the deadline so the
    # follow-up alert task can be scheduled deterministically.
    agent_confirmation_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    agent_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Post-visit report — Sprint 9 fills this in.
    # Shape: { confirmation: {...}, observations: {...} } per dev plan §9.
    visit_report: Mapped[dict | None] = mapped_column(JSONB)
    visit_report_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Admin review of the post-visit report.
    visit_report_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    visit_report_reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    visit_report_review_note: Mapped[str | None] = mapped_column(Text)

    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    cancelled_by: Mapped[VisitCancelledBy | None] = mapped_column(
        Enum(VisitCancelledBy, name="visit_cancelled_by", values_callable=lambda x: [e.value for e in x])
    )
    cancelled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
