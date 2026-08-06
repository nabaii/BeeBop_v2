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
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._enums import ListingCategory, ListingStatus
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.student_accommodation import UnitType


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
    # Property-level *images* only. Two things are deliberately excluded by the
    # primaryjoin: photos owned by a unit type (off-campus room galleries), and
    # videos. Both exclusions exist for the same reason — every existing reader
    # (browse covers, dashboards, inspector, AI search) assumes each row here is
    # a property image it can drop into an <img>, and stays correct without
    # having to remember to filter. Unit galleries are reached through
    # `UnitType.photos`, videos through `videos` below, and `all_photos` is the
    # unfiltered view for moderation.
    photos: Mapped[list["ListingPhoto"]] = relationship(
        "ListingPhoto",
        primaryjoin=(
            "and_(Listing.id == ListingPhoto.listing_id,"
            " ListingPhoto.unit_type_id.is_(None),"
            " ListingPhoto.media_kind == 'image')"
        ),
        cascade="all, delete-orphan",
        order_by="ListingPhoto.display_order",
        overlaps="listing,all_photos,videos",
    )
    # The property gallery's video tour. Read-only: video rows are created and
    # deleted explicitly in app.listings.service, so this collection never needs
    # write cascades — and keeping it viewonly means it cannot interact with the
    # delete-orphan cascade on `photos`.
    videos: Mapped[list["ListingPhoto"]] = relationship(
        "ListingPhoto",
        primaryjoin=(
            "and_(Listing.id == ListingPhoto.listing_id,"
            " ListingPhoto.unit_type_id.is_(None),"
            " ListingPhoto.media_kind == 'video')"
        ),
        viewonly=True,
        order_by="ListingPhoto.display_order",
        overlaps="listing,photos,all_photos",
    )
    # Every media row on the listing regardless of gallery or kind. Read-only —
    # writes go through `photos` or `UnitType.photos` so ownership stays
    # unambiguous. This is what moderation reads.
    all_photos: Mapped[list["ListingPhoto"]] = relationship(
        "ListingPhoto",
        primaryjoin="Listing.id == ListingPhoto.listing_id",
        viewonly=True,
        order_by="ListingPhoto.display_order",
        overlaps="listing,photos,videos",
    )
    documents: Mapped[list["ListingDocument"]] = relationship(
        back_populates="listing",
        cascade="all, delete-orphan",
        order_by="ListingDocument.created_at",
    )
    # Student-accommodation unit types. Read-only here (the inventory is managed
    # through app.listings.student_inventory); exposed so search/detail can
    # eager-load per-unit pricing and bed availability. Off-campus listings
    # price per unit type, not on Listing.price.
    unit_types: Mapped[list["UnitType"]] = relationship(
        "UnitType",
        primaryjoin="Listing.id == UnitType.listing_id",
        viewonly=True,
        order_by="UnitType.created_at",
    )


class ListingPhoto(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One piece of gallery media — an image or a video tour clip.

    Videos share this table because they share everything that makes a gallery
    a gallery: an owning listing, an optional owning unit type, a room label
    and a per-gallery display order. `media_kind` is what separates them, and
    the relationships above filter on it so no existing image reader can be
    handed a video by accident.

    A video is never a cover (enforced here in the service layer and by a CHECK
    constraint): covers are also browse-card thumbnails and share previews.
    """

    __tablename__ = "listing_photos"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Owning unit type, for off-campus room galleries. NULL = a property-level
    # photo (the listing gallery). `is_cover` and `display_order` are scoped to
    # one gallery, so each unit type has its own cover and its own ordering.
    #
    # Photos are created inside a gallery and stay there: moving one between
    # galleries by reassigning this column would read as a removal from
    # `Listing.photos` and trip its delete-orphan cascade.
    unit_type_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unit_types.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    # "image" | "video". Kept as a plain string rather than a PG enum so adding
    # a kind later is a no-op migration (same call the `price_period` column
    # makes).
    media_kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="image", server_default="image"
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    # Cloudinary public id, stored so delivery URLs can be derived rather than
    # parsed back out of `url` — poster frames and quality/format transforms
    # both need it. Null on rows created before video support.
    provider_public_id: Mapped[str | None] = mapped_column(String(300))
    # Still frame shown before playback. Video only; images are their own poster.
    poster_url: Mapped[str | None] = mapped_column(String(500))
    # Video only, both reported by Cloudinary at upload and re-validated on
    # register so the duration/size caps cannot be bypassed by a crafted call.
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    room_label: Mapped[str | None] = mapped_column(String(100))    # Living Room, Bedroom, etc.
    # Cover of its gallery. Images only — see the class docstring.
    is_cover: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Position within its gallery *and* its media kind: images and videos are
    # ordered independently, because they render as two separate groups.
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Inspector walkthrough photos are stored separately with this flag set,
    # rendered as "Beebop Verified Walkthrough" on the listing page.
    is_inspector_walkthrough: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    listing: Mapped[Listing] = relationship(
        "Listing",
        foreign_keys=[listing_id],
        overlaps="photos,all_photos,videos",
    )


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
