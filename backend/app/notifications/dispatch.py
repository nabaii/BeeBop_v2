"""Notification dispatch — writes the in-app row, then queues an async
delivery task per channel.

Sprint 4 scope: this is the single entry point used by every other module
that needs to notify a user. Sprint 8 layers the staged offer-expiry timer
job on top of the same `Notification` table.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models._enums import NotificationChannel, NotificationStatus
from app.models.notification import Notification
from app.notifications.templates import REGISTRY

logger = logging.getLogger(__name__)


async def dispatch_notification(
    *, user_id: uuid.UUID, event_type: str, payload: dict, db: AsyncSession
) -> list[Notification]:
    """Persist a Notification row per channel + enqueue Celery delivery.

    The in-app row is persisted with `status=QUEUED`; the WebSocket gateway
    in `notifications.realtime` (Sprint 5) reads new rows and pushes to
    connected clients. Email/WhatsApp Celery tasks transition the row to
    SENT/FAILED on completion.
    """
    template = REGISTRY.get(event_type)
    if template is None:
        logger.warning("No template registered for event_type=%s — dropped.", event_type)
        return []

    rows: list[Notification] = []
    for channel in template.channels:
        row = Notification(
            user_id=user_id,
            event_type=event_type,
            channel=channel,
            status=NotificationStatus.QUEUED,
            payload=payload,
        )
        db.add(row)
        rows.append(row)
    await db.flush()

    # Enqueue Celery tasks. We import lazily to avoid a circular import via
    # the Celery app's settings hooks.
    from app.notifications.tasks import deliver_email, deliver_whatsapp

    for row in rows:
        if row.channel == NotificationChannel.EMAIL:
            deliver_email.delay(str(row.id))
        elif row.channel == NotificationChannel.WHATSAPP:
            deliver_whatsapp.delay(str(row.id))
        # IN_APP rows are picked up by the WebSocket gateway directly — no
        # Celery task needed because there is no external transport.

    return rows
