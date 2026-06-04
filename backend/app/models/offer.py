"""Offers — rent, student, sales. Short-let uses Booking instead."""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._enums import OfferStatus
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin

# Counter-offer round cap per dev plan §8.3.
MAX_OFFER_ROUNDS = 3


class Offer(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "offers"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    seeker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )

    price: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    move_in_date: Mapped[date | None] = mapped_column(Date)
    conditions: Mapped[str | None] = mapped_column(Text)

    status: Mapped[OfferStatus] = mapped_column(
        Enum(OfferStatus, name="offer_status", values_callable=lambda x: [e.value for e in x]),
        default=OfferStatus.PENDING,
        nullable=False,
        index=True,
    )

    # Counter-offer thread — up to MAX_OFFER_ROUNDS per dev plan §8.3.
    # `parent_offer_id` walks back round_number-1 -> 1. The thread root is the
    # original offer (round 1, parent_offer_id NULL). Each successive round
    # links to the offer it counters.
    parent_offer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offers.id", ondelete="SET NULL")
    )
    round_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Whose turn it is to respond. Seeker submits round 1 → landlord turn.
    # Landlord counters → seeker turn. Acceptance/rejection terminates.
    awaiting_landlord_response: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Pre-visit direct offers exist (post-visit gating only fires when the
    # listing has FULLY_VERIFIED status and a visit has been completed).
    requires_visit_before_acceptance: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    # 48-hour expiry timer — exact deadline stored so staged reminders
    # (Hour 0 / 24 / 36 / 48) can be scheduled deterministically. Reset on
    # every counter — the new round resets the timer for the new responder.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Tracks which staged reminder hooks have fired so the Celery sweeper
    # never double-sends. Keys: "h0", "h24", "h36", "h48".
    expiry_notifications_sent: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    parent: Mapped["Offer | None"] = relationship(remote_side="Offer.id")
