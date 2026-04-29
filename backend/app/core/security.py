"""JWT issuance and verification. Password-free — all auth is via OTP."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, cast

from jose import JWTError, jwt
from pydantic import BaseModel

from app.config import get_settings
from app.core.exceptions import UnauthorisedError

settings = get_settings()

TokenKind = Literal["access", "refresh"]


class TokenClaims(BaseModel):
    sub: str                      # user id (UUID string)
    role: str
    kind: TokenKind
    jti: str                      # unique id — rotated refresh tokens revoke previous jti
    exp: int
    iat: int


def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _build_token(
    user_id: uuid.UUID,
    role: str,
    kind: TokenKind,
    lifetime: timedelta,
    jti: str | None = None,
) -> tuple[str, str]:
    """Return (token, jti) — jti returned so refresh rotation can store it."""
    token_jti = jti or uuid.uuid4().hex
    issued = _now_ts()
    expires = int((datetime.now(timezone.utc) + lifetime).timestamp())
    payload = {
        "sub": str(user_id),
        "role": role,
        "kind": kind,
        "jti": token_jti,
        "iat": issued,
        "exp": expires,
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)
    return token, token_jti


def create_access_token(user_id: uuid.UUID, role: str) -> tuple[str, str]:
    return _build_token(
        user_id,
        role,
        "access",
        timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )


def create_refresh_token(
    user_id: uuid.UUID,
    role: str,
    jti: str | None = None,
) -> tuple[str, str]:
    return _build_token(
        user_id,
        role,
        "refresh",
        timedelta(days=settings.jwt_refresh_token_expire_days),
        jti=jti,
    )


def decode_token(token: str, *, expected_kind: TokenKind) -> TokenClaims:
    try:
        raw = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise UnauthorisedError("Invalid or expired token.", code="invalid_token") from exc

    claims = TokenClaims.model_validate(raw)
    if claims.kind != expected_kind:
        raise UnauthorisedError(
            f"Expected {expected_kind} token, got {claims.kind}.",
            code="wrong_token_kind",
        )
    return claims


def hash_ip(ip: str) -> str:
    """Used for agreement-signing audit trail — we record hashed IPs only."""
    import hashlib

    return hashlib.sha256(ip.encode("utf-8")).hexdigest()


# Type helper for call sites that only need the sub value as a UUID.
def user_id_from_claims(claims: TokenClaims) -> uuid.UUID:
    return cast(uuid.UUID, uuid.UUID(claims.sub))
