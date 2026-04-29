"""Short-let in-booking chat — threads scoped to a single Booking.

A thread is created automatically on booking confirmation with three
participants: seeker, host, and the BeeBop moderator service account.
"""

import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ChatThread(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "chat_threads"

    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        index=True,
        unique=True,
        nullable=False,
    )
    # Participants stored as a JSONB array of user IDs for fast membership checks.
    participant_ids: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="thread", cascade="all, delete-orphan", order_by="ChatMessage.created_at"
    )


class ChatMessage(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "chat_messages"

    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chat_threads.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # Content-filter results — { flagged: bool, patterns: ["nigerian_phone", ...] }.
    # Messages are delivered regardless of flag; moderator is alerted when set.
    flagged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    flag_patterns: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)

    # On-platform action shortcut markers — "extend_booking", "report_issue", etc.
    action_shortcut: Mapped[str | None] = mapped_column(String(64))

    # System messages from the moderator carry the BeeBop label in-UI.
    is_moderator_message: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    thread: Mapped[ChatThread] = relationship(back_populates="messages")
