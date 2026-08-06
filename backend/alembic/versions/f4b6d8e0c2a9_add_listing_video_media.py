"""add_listing_video_media

Galleries gain video. Rather than a second table, `listing_photos` gets a
`media_kind` discriminator ('image' | 'video') plus the fields video needs and
photos don't: the provider public id (required to derive a poster frame and a
bandwidth-appropriate transform), a poster url, a duration and a byte size.

Existing rows are backfilled to 'image' by the server_default, and every
existing reader keeps seeing images only because `Listing.photos` /
`UnitType.photos` filter on `media_kind == 'image'` in their primaryjoin — the
same technique already used to split property photos from unit-type photos.

A CHECK constraint backs the product rule that a video is never a gallery
cover: covers feed browse cards and share previews, which must stay images.

Revision ID: f4b6d8e0c2a9
Revises: e1a7c3d5f9b2
Create Date: 2026-08-06 10:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f4b6d8e0c2a9"
down_revision: str | Sequence[str] | None = "e1a7c3d5f9b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "listing_photos",
        sa.Column("media_kind", sa.String(16), nullable=False, server_default="image"),
    )
    # Cloudinary public id. Needed for video far more than for images: poster
    # frames and `q_auto,f_auto` delivery are derived from it, and we cannot
    # reconstruct it reliably from secure_url alone.
    op.add_column(
        "listing_photos", sa.Column("provider_public_id", sa.String(300), nullable=True)
    )
    op.add_column("listing_photos", sa.Column("poster_url", sa.String(500), nullable=True))
    op.add_column("listing_photos", sa.Column("duration_seconds", sa.Integer(), nullable=True))
    op.add_column("listing_photos", sa.Column("size_bytes", sa.Integer(), nullable=True))

    op.create_check_constraint(
        "ck_listing_photos_video_never_cover",
        "listing_photos",
        "media_kind <> 'video' OR is_cover = false",
    )


def downgrade() -> None:
    # Destructive on purpose. Without `media_kind` a video row is
    # indistinguishable from a photo, and every gallery reader would render an
    # <img> pointing at an .mp4. Dropping the rows is the only honest reverse.
    op.execute("DELETE FROM listing_photos WHERE media_kind = 'video'")

    op.drop_constraint(
        "ck_listing_photos_video_never_cover", "listing_photos", type_="check"
    )
    op.drop_column("listing_photos", "size_bytes")
    op.drop_column("listing_photos", "duration_seconds")
    op.drop_column("listing_photos", "poster_url")
    op.drop_column("listing_photos", "provider_public_id")
    op.drop_column("listing_photos", "media_kind")
