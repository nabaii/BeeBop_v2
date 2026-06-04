"""Listing models — unified across four categories with type-specific fields.

Amenities are stored as JSONB (structured checklist grouped by Power/Water/
Security/Internet/Parking/Kitchen/Laundry) rather than normalised rows — the
amenity list is fixed UI copy and won't be queried independently.

Draft-friendly: every required-at-submission field is nullable on the model so
partially-filled drafts can be persisted on every field-change. Validation of
"fully ready to submit" lives in `app.listings.service` at submission time.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._enums import ListingCategory, ListingStatus
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Listing(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "listings"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )

    category: Mapped[ListingCategory] = mapped_column(
        Enum(ListingCategory, name="listing_category", values_callable=lambda x: [e.value for e in x]), nullable=False, index=True
    )
    status: Mapped[ListingStatus] = mapped_column(
        Enum(ListingStatus, name="listing_status", values_callable=lambda x: [e.value for e in x]),
        default=ListingStatus.DRAFT,
        nullable=False,
        index=True,
    )

    title: Mapped[str | None] = mapped_column(String(200))
    subtitle: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)

    # Address — approximate pin shown publicly. Exact address revealed only
    # after offer acceptance or confirmed visit per product brief §6.1.
    address_line: Mapped[str | None] = mapped_column(String(500))
    district: Mapped[str | None] = mapped_column(String(100), index=True)
    gps_lat: Mapped[float | None] = mapped_column(Float)
    gps_lng: Mapped[float | None] = mapped_column(Float)

    # Amenities — structured checklist. Each item carries a `confirmed` flag
    # populated on physical-badge issuance (inspector confirmation).
    amenities: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Price — unit varies by category. Represented as Numeric for Naira
    # precision. Rent: annual. Student: per agreed term. Short-let: nightly.
    # Sales: total. NULL on incomplete drafts.
    price: Mapped[float | None] = mapped_column(Numeric(14, 2))

    # Category-specific structured fields — flexible on purpose.
    #   rent:      bedroom_count, property_type, furnishing, payment_structure, available_from
    #   sales:     bedroom_count, property_type, development_status, title_type
    #   short-let: base_rate, weekend_rate, min_stay, turnaround_days, instant_booking
    #   off-campus: institutions_accepted (array), ...
    type_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # View/save analytics — denormalised for fast dashboard reads.
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    save_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    enquiry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Admin lifecycle — both nullable. Soft-delete retains data per dev plan §7.4.
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    suspension_reason: Mapped[str | None] = mapped_column(Text)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Admin doc-review query/reject note. Visible to the listing owner only.
    review_note: Mapped[str | None] = mapped_column(Text)

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="listings", foreign_keys=[owner_id])
    photos: Mapped[list["ListingPhoto"]] = relationship(
        back_populates="listing",
        cascade="all, delete-orphan",
        order_by="ListingPhoto.display_order",
    )
    documents: Mapped[list["ListingDocument"]] = relationship(
        back_populates="listing",
        cascade="all, delete-orphan",
        order_by="ListingDocument.created_at",
    )


class ListingPhoto(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "listing_photos"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    room_label: Mapped[str | None] = mapped_column(String(100))    # Living Room, Bedroom, etc.
    is_cover: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Inspector walkthrough photos are stored separately with this flag set,
    # rendered as "BeeBop Verified Walkthrough" on the listing page.
    is_inspector_walkthrough: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    listing: Mapped[Listing] = relationship(back_populates="photos")


class ListingDocument(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Title documents supporting the doc-verification pipeline.

    Stored in a private S3 bucket. Public access is never granted — admin
    reviewers see short-expiry presigned URLs. Owners see a placeholder label
    (filename + doc type) but cannot re-download once submitted; this avoids
    reuse of the same leaked link across admin/owner sessions.
    """

    __tablename__ = "listing_documents"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    s3_key: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # Owner-selected type label: "c_of_o", "deed_of_assignment", "governors_consent",
    # "tenancy_agreement", "receipt", "other". Free-text allowed for future additions.
    doc_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(Integer)

    listing: Mapped[Listing] = relationship(back_populates="documents")


class ListingAmenity(Base, UUIDPrimaryKeyMixin):
    """Placeholder model — amenities live inside Listing.amenities JSONB.

    Reserved for a future migration to relational amenity storage if queryable
    amenity analytics become necessary.
    """

    __tablename__ = "listing_amenities"


from app.models.user import User  # noqa: E402
