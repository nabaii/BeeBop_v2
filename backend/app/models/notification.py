"""Notification dispatch records — every email, WhatsApp, and in-app event."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._enums import NotificationChannel, NotificationStatus
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Notification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # Event classification — "offer.received", "agreement.ready_to_sign", etc.
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    channel: Mapped[NotificationChannel] = mapped_column(
        Enum(NotificationChannel, name="notification_channel", values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    status: Mapped[NotificationStatus] = mapped_column(
        Enum(NotificationStatus, name="notification_status", values_callable=lambda x: [e.value for e in x]),
        default=NotificationStatus.QUEUED,
        nullable=False,
        index=True,
    )

    # Structured payload for the renderer — includes the template name for
    # WhatsApp and the variables for the Resend template.
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Whether user has seen the in-app notification.
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_reason: Mapped[str | None] = mapped_column(Text)
