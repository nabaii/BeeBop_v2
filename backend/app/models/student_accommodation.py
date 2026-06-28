"""Student accommodation inventory — unit types and room-level beds.

Gender tagging and amenities live at the unit-type level: seekers browse
availability and price per unit type, and a unit type serves one sex with a
fixed amenity set. Self-contain units carry no gender tag (Gender.ANY).
Rooms are physical instances that only track bed counts.
"""

import uuid

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Integer, String, Numeric
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._enums import BedStatus, Gender, UnitKind
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class UnitType(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "unit_types"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)      # e.g., "Single room"
    kind: Mapped[UnitKind] = mapped_column(Enum(UnitKind, name="unit_kind", values_callable=lambda x: [e.value for e in x]), nullable=False)
    beds_per_room: Mapped[int] = mapped_column(Integer, nullable=False)
    total_units: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, server_default="0.0")
    # Billing period the price covers, e.g. "year" or "semester". Shown next to
    # every off-campus price so seekers always know what they are paying per.
    # ("session" is the legacy value for what is now called a semester.)
    price_period: Mapped[str] = mapped_column(
        String(16), nullable=False, default="year", server_default="year"
    )
    # Gender served by this unit type. Self-contain units use ANY (no tag).
    gender_tag: Mapped[Gender] = mapped_column(
        Enum(Gender, name="gender", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        server_default=Gender.ANY.value,
    )
    amenities: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default="[]", nullable=False
    )

    rooms: Mapped[list["Room"]] = relationship(
        back_populates="unit_type", cascade="all, delete-orphan"
    )


class Room(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "rooms"

    unit_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unit_types.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    beds_total: Mapped[int] = mapped_column(Integer, nullable=False)
    beds_available: Mapped[int] = mapped_column(Integer, nullable=False)
    bed_status_summary: Mapped[BedStatus] = mapped_column(
        Enum(BedStatus, name="bed_status", values_callable=lambda x: [e.value for e in x]), default=BedStatus.AVAILABLE, nullable=False
    )

    unit_type: Mapped[UnitType] = relationship(back_populates="rooms")

    __table_args__ = (
        CheckConstraint(
            "beds_available >= 0 AND beds_available <= beds_total",
            name="ck_room_beds_available_range",
        ),
    )
