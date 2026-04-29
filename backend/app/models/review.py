"""Reviews — gated to verified transactors only.

Short-let carries sub-category ratings (Accuracy, Cleanliness, Location,
Value). Rent/student carry an overall star rating + optional text. Sales have
no reviews (one-time transaction).
"""

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Review(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "reviews"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    # Source transaction — either a Booking (short-let) or an Agreement (rent/student).
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL")
    )
    agreement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agreements.id", ondelete="SET NULL")
    )

    overall_rating: Mapped[int] = mapped_column(Integer, nullable=False)

    # Short-let sub-categories — NULL for other types.
    rating_accuracy: Mapped[int | None] = mapped_column(Integer)
    rating_cleanliness: Mapped[int | None] = mapped_column(Integer)
    rating_location: Mapped[int | None] = mapped_column(Integer)
    rating_value: Mapped[int | None] = mapped_column(Integer)

    body: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "overall_rating BETWEEN 1 AND 5", name="ck_review_overall_range"
        ),
    )
