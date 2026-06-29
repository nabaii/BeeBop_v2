"""Off-campus reservations — the 'Book now' full-term flow.

A reservation is the off-campus analogue of a short-let Booking: the seeker
picks a unit type and pays the full term price upfront via Paystack. On
payment confirmation the reservation flips to CONFIRMED and one bed in the
chosen unit type is decremented. Unlike short-let there are no nightly dates;
the unit is held for the billing term (year / semester).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._enums import ReservationStatus
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Reservation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "reservations"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    seeker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    unit_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("unit_types.id", ondelete="RESTRICT"), index=True, nullable=False
    )

    status: Mapped[ReservationStatus] = mapped_column(
        Enum(ReservationStatus, name="reservation_status", values_callable=lambda x: [e.value for e in x]),
        default=ReservationStatus.PENDING_PAYMENT,
        nullable=False,
        index=True,
    )

    # Snapshot of the unit at booking time (the landlord can re-price later).
    unit_type_name: Mapped[str] = mapped_column(String(100), nullable=False)
    price_period: Mapped[str] = mapped_column(String(16), nullable=False, default="year")

    # Pricing breakdown (Naira). base = full-term unit price, seeker_fee per
    # the student-accommodation fee schedule, grand_total = base + seeker_fee.
    base_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    seeker_fee: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    owner_fee: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    grand_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    paystack_reference: Mapped[str | None] = mapped_column(String(200))
    payment_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
