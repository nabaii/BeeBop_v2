"""Bookmark endpoints.

Saved listings persist across sessions per dev plan §7.3. A listing that
transitions to `let_agreed` / `sale_agreed` / `delisted` is not auto-removed
from a user's saved list — the UI annotates the card as unavailable instead.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.bookmark import Bookmark
from app.models.listing import Listing
from app.models.user import User
from app.search.schemas import PublicListingSummary
from app.search.service import _summarise, _video_listing_ids

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


@router.post("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def save_listing(
    listing_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    bookmark = Bookmark(user_id=user.id, listing_id=listing_id)
    db.add(bookmark)
    try:
        await db.commit()
    except IntegrityError:
        # Idempotent: saving the same listing twice is a no-op.
        await db.rollback()


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unsave_listing(
    listing_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    stmt = select(Bookmark).where(
        Bookmark.user_id == user.id, Bookmark.listing_id == listing_id
    )
    bookmark = (await db.execute(stmt)).scalar_one_or_none()
    if bookmark is not None:
        await db.delete(bookmark)
        await db.commit()


@router.get("", response_model=list[PublicListingSummary])
async def list_saved(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[PublicListingSummary]:
    stmt = (
        select(Listing)
        .join(Bookmark, Bookmark.listing_id == Listing.id)
        .where(Bookmark.user_id == user.id)
        .options(selectinload(Listing.photos))
        .order_by(Bookmark.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().unique().all()
    video_ids = await _video_listing_ids(db, [r.id for r in rows])
    return [_summarise(r, None, video_ids) for r in rows]
