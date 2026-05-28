"""Password-auth unit tests."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.auth.service import set_password
from app.core.exceptions import UnauthorisedError
from app.core.security import hash_password, verify_password
from app.models._enums import UserRole


class FakeDb:
    def __init__(self) -> None:
        self.flushed = False

    async def flush(self) -> None:
        self.flushed = True


def _user(password_hash: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="user@example.com",
        password_hash=password_hash,
        role=UserRole.SEEKER,
        first_name="Bee",
        last_name="Bop",
        account_type=None,
        category_preferences=["rent"],
    )


def test_password_hash_roundtrip() -> None:
    digest = hash_password("correct123")

    assert digest != "correct123"
    assert verify_password("correct123", digest)
    assert not verify_password("wrong1234", digest)
    assert not verify_password("correct123", None)


@pytest.mark.asyncio
async def test_set_password_for_otp_only_user() -> None:
    user = _user()
    db = FakeDb()

    view = await set_password(
        user=user,  # type: ignore[arg-type]
        current_password=None,
        new_password="correct123",
        db=db,  # type: ignore[arg-type]
    )

    assert db.flushed
    assert user.password_hash != "correct123"
    assert verify_password("correct123", user.password_hash)
    assert view.has_password is True


@pytest.mark.asyncio
async def test_set_password_requires_current_password_when_one_exists() -> None:
    user = _user(hash_password("oldpass123"))

    with pytest.raises(UnauthorisedError) as exc:
        await set_password(
            user=user,  # type: ignore[arg-type]
            current_password="wrongpass123",
            new_password="newpass123",
            db=FakeDb(),  # type: ignore[arg-type]
        )

    assert exc.value.code == "invalid_current_password"
    assert verify_password("oldpass123", user.password_hash)
