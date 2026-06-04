"""Document and physical verification badges.

A listing may hold one, both, or neither. Both present -> Fully Verified is
derived at query time (not stored). Student listings are exempt from the doc
badge requirement per product brief §3.1.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._enums import BadgeStatus, BadgeType
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Badge(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "badges"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    type: Mapped[BadgeType] = mapped_column(Enum(BadgeType, name="badge_type", values_callable=lambda x: [e.value for e in x]), nullable=False)
    status: Mapped[BadgeStatus] = mapped_column(
        Enum(BadgeStatus, name="badge_status", values_callable=lambda x: [e.value for e in x]), default=BadgeStatus.ACTIVE, nullable=False
    )

    issued_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    # Physical badges also reference the inspector whose report led to issuance.
    inspector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    # Validity — doc badge 24 months, physical badge 12 months per product brief §3.3.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revocation_reason: Mapped[str | None] = mapped_column(Text)
