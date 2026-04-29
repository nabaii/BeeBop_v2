"""Celery tasks — async notification delivery.

Tasks run synchronously through asyncio.run because Celery isn't natively
async. The cost of spinning up a loop per task is acceptable for the
notification volume we expect at MVP scale.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.integrations.email_resend import get_email_client
from app.integrations.whatsapp import get_whatsapp_client
from app.models._enums import NotificationStatus
from app.models.notification import Notification
from app.models.user import User
from app.notifications.celery_app import celery_app
from app.notifications.templates import REGISTRY

logger = logging.getLogger(__name__)


async def _load_notification(notification_id: uuid.UUID) -> tuple[Notification, User]:
    async with AsyncSessionLocal() as db:
        row = await db.get(Notification, notification_id)
        if row is None:
            raise LookupError(f"Notification {notification_id} not found.")
        user = await db.get(User, row.user_id)
        if user is None:
            raise LookupError(f"Recipient user {row.user_id} not found.")
        return row, user


async def _mark(notification_id: uuid.UUID, status: NotificationStatus, *, reason: str | None = None) -> None:
    async with AsyncSessionLocal() as db:
        row = await db.get(Notification, notification_id)
        if row is None:
            return
        row.status = status
        row.sent_at = datetime.now(timezone.utc) if status == NotificationStatus.SENT else row.sent_at
        if reason:
            row.failure_reason = reason
        await db.commit()


async def _send_email(notification_id: uuid.UUID) -> None:
    row, user = await _load_notification(notification_id)
    template = REGISTRY.get(row.event_type)
    if template is None or template.render_email is None:
        await _mark(notification_id, NotificationStatus.FAILED, reason="no_email_template")
        return
    content = template.render_email(row.payload)
    client = get_email_client()
    try:
        await client.send(to=user.email, subject=content.subject, html=content.html, text=content.text)
    except Exception as exc:  # noqa: BLE001 — propagate to Celery retry below.
        await _mark(notification_id, NotificationStatus.FAILED, reason=str(exc)[:500])
        raise
    await _mark(notification_id, NotificationStatus.SENT)


async def _send_whatsapp(notification_id: uuid.UUID) -> None:
    row, user = await _load_notification(notification_id)
    template = REGISTRY.get(row.event_type)
    if template is None or template.render_whatsapp is None:
        await _mark(notification_id, NotificationStatus.FAILED, reason="no_whatsapp_template")
        return
    content = template.render_whatsapp(row.payload)
    if not user.phone:
        await _mark(notification_id, NotificationStatus.FAILED, reason="no_phone_on_record")
        return
    client = get_whatsapp_client()
    try:
        await client.send_template(
            to=user.phone, template_name=content.template, parameters=content.parameters
        )
    except Exception as exc:  # noqa: BLE001
        await _mark(notification_id, NotificationStatus.FAILED, reason=str(exc)[:500])
        raise
    await _mark(notification_id, NotificationStatus.SENT)


@celery_app.task(name="app.notifications.tasks.deliver_email", bind=True, max_retries=3)
def deliver_email(self, notification_id: str) -> None:  # type: ignore[no-untyped-def]
    try:
        asyncio.run(_send_email(uuid.UUID(notification_id)))
    except Exception as exc:  # noqa: BLE001
        # Exponential backoff: 60s, 120s, 240s.
        countdown = 60 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=countdown)


@celery_app.task(name="app.notifications.tasks.deliver_whatsapp", bind=True, max_retries=3)
def deliver_whatsapp(self, notification_id: str) -> None:  # type: ignore[no-untyped-def]
    try:
        asyncio.run(_send_whatsapp(uuid.UUID(notification_id)))
    except Exception as exc:  # noqa: BLE001
        countdown = 60 * (2**self.request.retries)
        raise self.retry(exc=exc, countdown=countdown)


@celery_app.task(name="app.notifications.tasks.broker_liveness")
def broker_liveness() -> str:
    """Cheap daily check that the worker is reachable. Picked up by Beat."""
    logger.info("Celery broker liveness OK at %s", datetime.now(timezone.utc).isoformat())
    return "ok"
