from __future__ import annotations

from types import SimpleNamespace
import pytest

from app.auth.admin_bootstrap import bootstrap_landlord_from_settings
from app.config import Settings
from app.models._enums import AccountType, UserRole
from app.models.user import User
from app.core.security import verify_password


class FakeExecuteResult:
    def __init__(self, user: User | None) -> None:
        self._user = user

    def scalar_one_or_none(self) -> User | None:
        return self._user


class FakeSession:
    def __init__(self, user: User | None = None) -> None:
        self.user = user
        self.added: list[User] = []
        self.committed = False

    async def __aenter__(self) -> FakeSession:
        return self

    async def __aexit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        pass

    async def execute(self, statement: object) -> FakeExecuteResult:
        return FakeExecuteResult(self.user)

    def add(self, obj: User) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.committed = True


@pytest.mark.asyncio
async def test_bootstrap_landlord_does_nothing_if_no_email(monkeypatch: pytest.MonkeyPatch) -> None:
    session = FakeSession()
    monkeypatch.setattr("app.auth.admin_bootstrap.AsyncSessionLocal", lambda: session)

    settings = Settings(
        landlord_bootstrap_email="",
        landlord_bootstrap_password="password123",
    )
    await bootstrap_landlord_from_settings(settings)

    assert not session.committed
    assert len(session.added) == 0


@pytest.mark.asyncio
async def test_bootstrap_landlord_creates_new_user(monkeypatch: pytest.MonkeyPatch) -> None:
    session = FakeSession(user=None)
    monkeypatch.setattr("app.auth.admin_bootstrap.AsyncSessionLocal", lambda: session)

    settings = Settings(
        landlord_bootstrap_email="landlord-test@beebop.store",
        landlord_bootstrap_first_name="John",
        landlord_bootstrap_last_name="Doe",
        landlord_bootstrap_password="Password123",
    )
    await bootstrap_landlord_from_settings(settings)

    assert session.committed
    assert len(session.added) == 1
    user = session.added[0]
    assert user.email == "landlord-test@beebop.store"
    assert user.role == UserRole.LANDLORD
    assert user.first_name == "John"
    assert user.last_name == "Doe"
    assert user.account_type == AccountType.INDIVIDUAL
    assert user.nin_verified is True
    assert user.bvn_verified is True
    assert user.is_active is True
    assert verify_password("Password123", user.password_hash)


@pytest.mark.asyncio
async def test_bootstrap_landlord_promotes_existing_user(monkeypatch: pytest.MonkeyPatch) -> None:
    existing_user = User(
        email="existing-landlord@beebop.store",
        role=UserRole.SEEKER,
        first_name="Alice",
        last_name="Smith",
    )
    session = FakeSession(user=existing_user)
    monkeypatch.setattr("app.auth.admin_bootstrap.AsyncSessionLocal", lambda: session)

    settings = Settings(
        landlord_bootstrap_email="existing-landlord@beebop.store",
        landlord_bootstrap_first_name="Alice",
        landlord_bootstrap_last_name="Smith",
        landlord_bootstrap_password="NewPassword123",
    )
    await bootstrap_landlord_from_settings(settings)

    assert session.committed
    assert len(session.added) == 0
    assert existing_user.role == UserRole.LANDLORD
    assert existing_user.account_type == AccountType.INDIVIDUAL
    assert existing_user.nin_verified is True
    assert existing_user.bvn_verified is True
    assert verify_password("NewPassword123", existing_user.password_hash)
