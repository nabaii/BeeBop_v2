"""Short-let bookings — the only category where a booking replaces an offer."""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._enums import BookingStatus
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Booking(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "bookings"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    seeker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )

    check_in: Mapped[date] = mapped_column(Date, nullable=False)
    check_out: Mapped[date] = mapped_column(Date, nullable=False)
    guest_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, name="booking_status", values_callable=lambda x: [e.value for e in x]),
        default=BookingStatus.REQUESTED,
        nullable=False,
        index=True,
    )
    instant_booking: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Pricing snapshot (the host can change listing pricing later).
    base_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    weekend_uplift: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    seeker_fee: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    host_fee: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    grand_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    paystack_reference: Mapped[str | None] = mapped_column(String(200))
    payment_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Acceptance/decision metadata (request-flow only).
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decline_reason: Mapped[str | None] = mapped_column(Text)

    # Access details — populated at booking confirmation, released to the seeker
    # via email + WhatsApp on check-in day per dev plan §8.6.
    access_details: Mapped[str | None] = mapped_column(Text)
    access_details_released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payout_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payout_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    payout_reference: Mapped[str | None] = mapped_column(String(200))

    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
