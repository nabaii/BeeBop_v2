"""Inspection reports and area-infrastructure scores.

Area scores live against GPS coordinates (not listing IDs) so multiple listings
in the same cell share the same score record. Admin can update scores without
touching badge status per product brief §3.2.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._enums import InspectionReportStatus
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class InspectionReport(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "inspection_reports"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    inspector_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    status: Mapped[InspectionReportStatus] = mapped_column(
        Enum(InspectionReportStatus, name="inspection_report_status"),
        default=InspectionReportStatus.ASSIGNED,
        nullable=False,
        index=True,
    )

    # Property assessment checklist — identity, listing accuracy, amenities, structural.
    # Structured payload validated against a Pydantic model in the review endpoint.
    assessment: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Evidence — photo/video S3 keys with GPS and timestamp metadata captured
    # via the browser Geolocation API (not EXIF — can be stripped by phones).
    evidence: Mapped[list[dict]] = mapped_column(JSONB, default=list, nullable=False)

    # Pin set on the property's exact GPS, captured during the visit. Public
    # listing page still shows only the approximate district pin.
    visit_gps_lat: Mapped[float | None] = mapped_column(Float)
    visit_gps_lng: Mapped[float | None] = mapped_column(Float)

    inspector_note: Mapped[str | None] = mapped_column(Text)

    # Set when the inspector clicks Submit; locks the report from further edits.
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Admin assignment metadata + review.
    assigned_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(Text)


class AreaScore(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Per-geographic-cell infrastructure scores.

    Coordinates are snapped to a grid cell (configured in app.core) so multiple
    listings in the same estate share a record. Admin can edit these without
    re-inspecting (e.g., after a road repair or EKEDC supply change).
    """

    __tablename__ = "area_scores"

    # Cell identity — we store the cell anchor coordinates; the resolver maps
    # any listing GPS to its cell key at query time.
    cell_lat: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    cell_lng: Mapped[float] = mapped_column(Float, nullable=False, index=True)

    # Each category scored 1–5. NULL before first assessment.
    road_condition: Mapped[int | None] = mapped_column(Integer)
    electricity_supply_hours: Mapped[int | None] = mapped_column(Integer)      # inspector-observed
    electricity_supply_hours_reported: Mapped[int | None] = mapped_column(Integer)  # landlord
    security: Mapped[int | None] = mapped_column(Integer)
    proximity: Mapped[int | None] = mapped_column(Integer)

    # Proximity distance records (nearest markets, hospitals, universities).
    landmarks: Mapped[list[dict]] = mapped_column(JSONB, default=list, nullable=False)

    last_assessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str | None] = mapped_column(String(32))   # "inspection" | "admin_edit"
