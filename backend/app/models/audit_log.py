"""Admin audit log — every staff-side mutation captured for accountability.

Per dev plan §7.4: "All admin edits logged with timestamp and admin ID."
Generic shape — `entity_type` + `entity_id` lets us cover listings, users,
inspection reports, and any future admin surface without adding tables.
"""

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AdminAuditLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "admin_audit_log"

    admin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    # e.g. "listing", "user", "inspection_report".
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    # e.g. "doc.approve", "doc.query", "doc.reject", "listing.suspend",
    # "listing.restore", "listing.soft_delete", "listing.edit".
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Action context — `{ "note": "...", "before": {...}, "after": {...} }`.
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
