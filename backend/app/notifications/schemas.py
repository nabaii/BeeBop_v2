"""User-facing notification schemas (in-app inbox)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models._enums import NotificationChannel, NotificationStatus


class NotificationView(BaseModel):
    id: str
    event_type: str
    channel: NotificationChannel
    status: NotificationStatus
    payload: dict
    read_at: datetime | None = None
    sent_at: datetime | None = None
    created_at: datetime


class InboxResponse(BaseModel):
    items: list[NotificationView]
    unread_count: int
    page: int
    page_size: int
    total: int


class InboxFilters(BaseModel):
    unread_only: bool = False
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
