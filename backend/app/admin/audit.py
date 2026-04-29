"""Audit log writer — call from every admin mutation."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AdminAuditLog


async def record(
    *,
    admin_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    payload: dict | None = None,
    db: AsyncSession,
) -> AdminAuditLog:
    entry = AdminAuditLog(
        admin_id=admin_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        payload=payload or {},
    )
    db.add(entry)
    await db.flush()
    return entry
