"""Inspector activation gate — service-level helpers."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from app.inspector.service import is_activation_complete


def _user(**overrides: object) -> SimpleNamespace:
    base = {
        "id": uuid.uuid4(),
        "first_name": "Ada",
        "last_name": "Lovelace",
        "profile_photo_url": "https://res.cloudinary.com/example.jpg",
        "nin_verified": True,
        "conduct_acknowledged_at": datetime.now(timezone.utc),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_complete_when_all_fields_set() -> None:
    assert is_activation_complete(_user())


def test_blocks_without_first_name() -> None:
    assert not is_activation_complete(_user(first_name=None))


def test_blocks_without_last_name() -> None:
    assert not is_activation_complete(_user(last_name=None))


def test_blocks_without_profile_photo() -> None:
    assert not is_activation_complete(_user(profile_photo_url=None))


def test_blocks_without_nin_verified() -> None:
    assert not is_activation_complete(_user(nin_verified=False))


def test_blocks_without_conduct_ack() -> None:
    assert not is_activation_complete(_user(conduct_acknowledged_at=None))
