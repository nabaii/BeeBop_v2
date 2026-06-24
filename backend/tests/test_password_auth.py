"""Password-auth unit tests."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.auth.service import login_with_password, set_password, verify_otp_and_issue_tokens
from app.auth.otp_service import OtpService
from app.core.exceptions import UnauthorisedError, ValidationError
from app.core.security import decode_token, hash_password, verify_password
from app.models._enums import UserRole


class FakeDb:
    def __init__(self) -> None:
        self.flushed = False

    async def flush(self) -> None:
        self.flushed = True


class FakeLoginResult:
    def __init__(self, user: SimpleNamespace | None) -> None:
        self.user = user

    def scalar_one_or_none(self) -> SimpleNamespace | None:
        return self.user

    def scalar(self) -> object:
        # Used by the referral-code collision check during registration; with no
        # seeded user this resolves to a zero count (no collision).
        return self.user


class FakeLoginDb:
    def __init__(self, user: SimpleNamespace | None) -> None:
        self.user = user

    async def execute(self, _statement: object) -> FakeLoginResult:
        return FakeLoginResult(self.user)


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
        is_active=True,
        is_suspended=False,
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


@pytest.mark.asyncio
async def test_login_with_password_issues_tokens(fake_redis) -> None:  # type: ignore[no-untyped-def]
    user = _user(hash_password("correct123"))

    result = await login_with_password(
        email=" USER@example.com ",
        password="correct123",
        db=FakeLoginDb(user),  # type: ignore[arg-type]
        redis=fake_redis,  # type: ignore[arg-type]
    )

    assert result.is_new_user is False
    assert result.user.id == str(user.id)
    assert result.user.has_password is True
    access_claims = decode_token(result.tokens.access_token, expected_kind="access")
    refresh_claims = decode_token(result.tokens.refresh_token, expected_kind="refresh")
    assert access_claims.sub == str(user.id)
    assert await fake_redis.get(f"refresh:user:{user.id}") == refresh_claims.jti


@pytest.mark.asyncio
async def test_login_with_password_rejects_invalid_credentials(fake_redis) -> None:  # type: ignore[no-untyped-def]
    user = _user(hash_password("correct123"))

    with pytest.raises(UnauthorisedError) as exc:
        await login_with_password(
            email="user@example.com",
            password="wrongpass123",
            db=FakeLoginDb(user),  # type: ignore[arg-type]
            redis=fake_redis,  # type: ignore[arg-type]
        )

    assert exc.value.code == "invalid_credentials"


class FakeRegisterDb:
    def __init__(self, user: SimpleNamespace | None = None) -> None:
        self.user = user
        self.added: list[object] = []
        self.committed = False
        self.flushed = False

    async def execute(self, statement: object) -> FakeLoginResult:
        return FakeLoginResult(self.user)

    def add(self, obj: object) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.committed = True

    async def flush(self) -> None:
        self.flushed = True


async def mock_async_verify(*args, **kwargs) -> None:
    pass


@pytest.mark.asyncio
async def test_verify_otp_new_user_requires_password(monkeypatch, fake_redis) -> None:
    monkeypatch.setattr(OtpService, "verify", mock_async_verify)
    db = FakeRegisterDb(None)

    with pytest.raises(ValidationError) as exc:
        await verify_otp_and_issue_tokens(
            channel="email",
            identifier="newuser@example.com",
            code="123456",
            role_if_new=UserRole.SEEKER,
            db=db,  # type: ignore
            redis=fake_redis,  # type: ignore
            password=None,
        )
    assert exc.value.code == "password_required"


@pytest.mark.asyncio
async def test_verify_otp_new_user_rejects_weak_password(monkeypatch, fake_redis) -> None:
    monkeypatch.setattr(OtpService, "verify", mock_async_verify)
    db = FakeRegisterDb(None)

    # Test short password
    with pytest.raises(ValidationError) as exc:
        await verify_otp_and_issue_tokens(
            channel="email",
            identifier="newuser@example.com",
            code="123456",
            role_if_new=UserRole.SEEKER,
            db=db,  # type: ignore
            redis=fake_redis,  # type: ignore
            password="123",
        )
    assert exc.value.code == "password_too_short"

    # Test password without number
    with pytest.raises(ValidationError) as exc:
        await verify_otp_and_issue_tokens(
            channel="email",
            identifier="newuser@example.com",
            code="123456",
            role_if_new=UserRole.SEEKER,
            db=db,  # type: ignore
            redis=fake_redis,  # type: ignore
            password="strongpassword",
        )
    assert exc.value.code == "password_no_number"


@pytest.mark.asyncio
async def test_verify_otp_new_user_creates_account_with_password(monkeypatch, fake_redis) -> None:
    monkeypatch.setattr(OtpService, "verify", mock_async_verify)
    db = FakeRegisterDb(None)

    result = await verify_otp_and_issue_tokens(
        channel="email",
        identifier="newuser@example.com",
        code="123456",
        role_if_new=UserRole.SEEKER,
        db=db,  # type: ignore
        redis=fake_redis,  # type: ignore
        password="strongpass123",
    )

    assert result.is_new_user is True
    # Registration adds the user and auto-issues their referral code (§2.1).
    from app.models.referral import ReferralCode

    new_user = next(
        o for o in db.added if getattr(o, "email", None) == "newuser@example.com"
    )
    assert verify_password("strongpass123", new_user.password_hash)
    assert any(isinstance(o, ReferralCode) for o in db.added)
