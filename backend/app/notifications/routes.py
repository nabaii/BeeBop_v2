"""User in-app notification inbox.

Email + WhatsApp delivery is handled by Celery (see `tasks.py`). This module
exposes the in-app channel rows so dashboards can render them.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.exceptions import NotFoundError
from app.database import get_db
from app.models._enums import NotificationChannel
from app.models.notification import Notification
from app.models.user import User
from app.notifications.schemas import InboxFilters, InboxResponse, NotificationView

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=InboxResponse)
async def list_inbox(
    filters: InboxFilters = Depends(),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InboxResponse:
    """Return the in-app notifications for the current user.

    Only `IN_APP` channel rows are surfaced — email + WhatsApp deliveries
    are observable but not part of the inbox UX.
    """
    base = select(Notification).where(
        Notification.user_id == user.id,
        Notification.channel == NotificationChannel.IN_APP,
    )

    unread_count = int(
        (
            await db.execute(
                select(func.count())
                .select_from(base.where(Notification.read_at.is_(None)).subquery())
            )
        ).scalar_one()
    )

    if filters.unread_only:
        base = base.where(Notification.read_at.is_(None))

    total = int(
        (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    )

    offset = (filters.page - 1) * filters.page_size
    rows = (
        (
            await db.execute(
                base.order_by(Notification.created_at.desc())
                .offset(offset)
                .limit(filters.page_size)
            )
        )
        .scalars()
        .all()
    )
    return InboxResponse(
        items=[
            NotificationView(
                id=str(r.id),
                event_type=r.event_type,
                channel=r.channel,
                status=r.status,
                payload=r.payload,
                read_at=r.read_at,
                sent_at=r.sent_at,
                created_at=r.created_at,
            )
            for r in rows
        ],
        unread_count=unread_count,
        page=filters.page,
        page_size=filters.page_size,
        total=total,
    )


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    notification_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    row = await db.get(Notification, notification_id)
    if row is None or row.user_id != user.id:
        raise NotFoundError("Notification not found.", code="notification_not_found")
    if row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        await db.commit()


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Mark every unread in-app notification as read in one call."""
    stmt = select(Notification).where(
        Notification.user_id == user.id,
        Notification.channel == NotificationChannel.IN_APP,
        Notification.read_at.is_(None),
    )
    rows = (await db.execute(stmt)).scalars().all()
    now = datetime.now(timezone.utc)
    for r in rows:
        r.read_at = now
    await db.commit()
