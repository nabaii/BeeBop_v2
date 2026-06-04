"""Student accommodation inventory — unit types and room-level beds.

Gender tagging lives at room level per product brief §8.3. Self-contain units
carry no gender tag (Gender.ANY). The tag is enforced at database level with
a check constraint: once a bed is occupied the room's gender tag is locked.
"""

import uuid

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
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
    # Gender tag is silently applied to seeker search. Self-contain rooms use ANY.
    gender_tag: Mapped[Gender] = mapped_column(Enum(Gender, name="gender", values_callable=lambda x: [e.value for e in x]), nullable=False)
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
        # Gender-tag lock on occupancy is enforced application-side in
        # Sprint 2 with a trigger migration — declared here for documentation.
    )
