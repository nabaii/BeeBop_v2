"""Gallery video rules — the caps applied when a browser registers an upload.

Uploads go straight from the browser to Cloudinary, so `register_photo` is the
first and only place we can enforce anything. These cover that boundary plus
the relationship filters that keep video rows out of every existing image
reader.
"""

from __future__ import annotations

import uuid

import pytest

from app.core.exceptions import ValidationError
from app.listings.service import (
    MAX_VIDEO_BYTES,
    MAX_VIDEO_DURATION_SECONDS,
    MAX_VIDEOS_PER_PROPERTY_GALLERY,
    MAX_VIDEOS_PER_UNIT_GALLERY,
    _validate_video,
)
from app.models.listing import Listing, ListingPhoto
from app.models.student_accommodation import UnitType


def _validate(**overrides: object) -> None:
    args: dict = {
        "duration_seconds": 45,
        "size_bytes": 12 * 1024 * 1024,
        "video_format": "mp4",
        "existing_count": 0,
        "unit_type_id": None,
    }
    args.update(overrides)
    _validate_video(**args)  # type: ignore[arg-type]


def _raises(code: str, **overrides: object) -> None:
    with pytest.raises(ValidationError) as excinfo:
        _validate(**overrides)
    assert excinfo.value.code == code


# --- caps -------------------------------------------------------------------


def test_typical_walkthrough_is_accepted() -> None:
    _validate()


def test_property_gallery_allows_up_to_three_videos() -> None:
    _validate(existing_count=MAX_VIDEOS_PER_PROPERTY_GALLERY - 1)
    _raises("video_limit_reached", existing_count=MAX_VIDEOS_PER_PROPERTY_GALLERY)


def test_unit_gallery_allows_exactly_one_video() -> None:
    assert MAX_VIDEOS_PER_UNIT_GALLERY == 1
    unit = uuid.uuid4()
    _validate(existing_count=0, unit_type_id=unit)
    _raises("video_limit_reached", existing_count=1, unit_type_id=unit)


def test_unit_limit_message_names_the_room_not_the_listing() -> None:
    with pytest.raises(ValidationError) as excinfo:
        _validate(existing_count=1, unit_type_id=uuid.uuid4())
    # Singular, and pointed at the right thing — a landlord hitting this on a
    # room shouldn't be told to go look at the listing.
    assert "1 video to this room type" in str(excinfo.value)


def test_duration_cap_is_inclusive() -> None:
    _validate(duration_seconds=MAX_VIDEO_DURATION_SECONDS)
    _raises("video_too_long", duration_seconds=MAX_VIDEO_DURATION_SECONDS + 1)


def test_size_cap_is_inclusive() -> None:
    _validate(size_bytes=MAX_VIDEO_BYTES)
    _raises("video_too_large", size_bytes=MAX_VIDEO_BYTES + 1)


def test_only_mp4_and_mov_are_accepted() -> None:
    _validate(video_format="mov")
    _validate(video_format="MP4")  # Cloudinary casing shouldn't matter.
    _raises("video_format_unsupported", video_format="avi")


# --- a crafted payload can't slip past ---------------------------------------


def test_missing_duration_is_rejected_rather_than_waved_through() -> None:
    # Cloudinary always reports these for a real video, so their absence means
    # the payload wasn't produced by one.
    _raises("video_duration_unknown", duration_seconds=None)
    _raises("video_duration_unknown", duration_seconds=0)


def test_missing_size_is_rejected_rather_than_waved_through() -> None:
    _raises("video_size_unknown", size_bytes=None)
    _raises("video_size_unknown", size_bytes=0)


# --- moderation --------------------------------------------------------------


def test_admin_detail_separates_videos_from_photos() -> None:
    # Admin loads ListingPhoto directly (deliberately — it must see unit
    # galleries too), so nothing filters videos out for it. Without a separate
    # list the moderation UI would point an <img> at an .mp4.
    from app.admin.schemas import AdminListingDetail

    assert "videos" in AdminListingDetail.model_fields
    assert "photos" in AdminListingDetail.model_fields


def test_admin_media_view_carries_the_video_fields() -> None:
    from app.listings.service import _media_view

    row = ListingPhoto(
        listing_id=uuid.uuid4(),
        media_kind="video",
        url="https://example.test/tour.mp4",
        poster_url="https://example.test/tour.jpg",
        duration_seconds=48,
        display_order=0,
        is_cover=False,
    )
    view = _media_view(row)
    assert view["media_kind"] == "video"
    assert view["poster_url"] == "https://example.test/tour.jpg"
    assert view["duration_seconds"] == 48


# --- relationship filters ----------------------------------------------------


def _join_sql(rel: object) -> str:
    return str(
        rel.property.primaryjoin.compile(  # type: ignore[attr-defined]
            compile_kwargs={"literal_binds": True}
        )
    )


def test_image_collections_exclude_videos() -> None:
    # This is what keeps browse covers, dashboards, AI search and the inspector
    # correct without any of them knowing video exists.
    assert "media_kind = 'image'" in _join_sql(Listing.photos)
    assert "media_kind = 'image'" in _join_sql(UnitType.photos)


def test_video_collections_exclude_images() -> None:
    assert "media_kind = 'video'" in _join_sql(Listing.videos)
    assert "media_kind = 'video'" in _join_sql(UnitType.videos)


def test_property_video_collection_stays_out_of_unit_galleries() -> None:
    assert "unit_type_id IS NULL" in _join_sql(Listing.videos)


def test_moderation_view_still_sees_everything() -> None:
    join = _join_sql(Listing.all_photos)
    assert "media_kind" not in join


def test_video_collections_are_viewonly() -> None:
    # Writes go through register/delete in the service; keeping these viewonly
    # means they can't interact with the delete-orphan cascade on `photos`.
    assert Listing.videos.property.viewonly
    assert UnitType.videos.property.viewonly


# --- the browse-card flag ----------------------------------------------------


def _video_flag_sql() -> str:
    from app.search.service import _video_ids_stmt

    return str(
        _video_ids_stmt([uuid.uuid4()]).compile(
            compile_kwargs={"literal_binds": True}
        )
    )


def test_video_flag_counts_videos_only() -> None:
    sql = _video_flag_sql()
    assert "media_kind = 'video'" in sql


def test_video_flag_excludes_inspector_clips() -> None:
    # An inspector walkthrough is independent evidence; badging it as the
    # host's tour would misattribute it.
    assert "is_inspector_walkthrough IS false" in _video_flag_sql()


def test_video_flag_counts_unit_galleries_too() -> None:
    # No unit_type_id predicate: a room tour counts for the listing's chip.
    assert "unit_type_id" not in _video_flag_sql()


def test_video_flag_is_deduplicated() -> None:
    # Three tours on one listing must not yield the listing three times.
    assert "DISTINCT" in _video_flag_sql()


def test_summarise_defaults_has_video_false_without_a_lookup() -> None:
    # Callers that don't pass the set get False rather than a lazy load — the
    # same contract `ratings` already has.
    from app.search.schemas import PublicListingSummary

    assert PublicListingSummary.model_fields["has_video"].default is False


def test_media_kind_defaults_to_image_on_both_sides() -> None:
    # Two defaults, two jobs. The Python-side default covers callers that build
    # a ListingPhoto without naming a kind (the attribute stays None until
    # flush, which is why this asserts the column rather than an instance).
    # The server_default is what backfills the rows that already existed when
    # the column was added.
    column = ListingPhoto.__table__.c.media_kind
    assert column.default.arg == "image"
    assert column.server_default.arg == "image"
    assert not column.nullable
