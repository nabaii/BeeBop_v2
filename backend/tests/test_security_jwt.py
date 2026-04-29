"""Unit tests for JWT creation and verification."""

from __future__ import annotations

import uuid

import pytest

from app.core.exceptions import UnauthorisedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    user_id_from_claims,
)
from app.models._enums import UserRole


def test_access_token_roundtrip() -> None:
    uid = uuid.uuid4()
    token, jti = create_access_token(uid, UserRole.SEEKER)
    claims = decode_token(token, expected_kind="access")

    assert claims.sub == str(uid)
    assert claims.role == UserRole.SEEKER.value
    assert claims.kind == "access"
    assert claims.jti == jti
    assert user_id_from_claims(claims) == uid


def test_refresh_token_roundtrip() -> None:
    uid = uuid.uuid4()
    token, _ = create_refresh_token(uid, UserRole.LANDLORD)
    claims = decode_token(token, expected_kind="refresh")
    assert claims.kind == "refresh"
    assert claims.role == UserRole.LANDLORD.value


def test_wrong_token_kind_rejected() -> None:
    uid = uuid.uuid4()
    access, _ = create_access_token(uid, UserRole.SEEKER)
    with pytest.raises(UnauthorisedError) as exc:
        decode_token(access, expected_kind="refresh")
    assert exc.value.code == "wrong_token_kind"


def test_invalid_token_rejected() -> None:
    with pytest.raises(UnauthorisedError):
        decode_token("not-a-real-token", expected_kind="access")


def test_refresh_reissue_preserves_jti_when_requested() -> None:
    uid = uuid.uuid4()
    _, first_jti = create_refresh_token(uid, UserRole.SEEKER)
    token, reused_jti = create_refresh_token(uid, UserRole.SEEKER, jti=first_jti)
    assert reused_jti == first_jti
    assert decode_token(token, expected_kind="refresh").jti == first_jti
