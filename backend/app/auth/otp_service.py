"""OTP generation, storage, delivery, and verification.

Storage: Redis with TTL. Keys namespaced by channel + identifier so email and
WhatsApp flows never collide:
    otp:email:{email_lowercased}          -> {code_hash}|{attempts}|{expires}
    otp:whatsapp:{e164_phone}             -> same shape

Codes are 6 digits, 5-minute lifetime, max 5 verification attempts before the
record is evicted and the user must request a new code.

Delivery format for email: HTML + plain-text via the Resend transactional
template. Delivery format for WhatsApp: approved `beebop_otp` template with
the code as the sole parameter.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from typing import Literal

from redis.asyncio import Redis

from app.config import get_settings
from app.core.exceptions import RateLimitedError, UnauthorisedError, ValidationError
from app.integrations.email_resend import get_email_client
from app.integrations.whatsapp import get_whatsapp_client

settings = get_settings()

Channel = Literal["email", "whatsapp"]

OTP_TTL_SECONDS = 5 * 60
MAX_VERIFY_ATTEMPTS = 5
CODE_LENGTH = 6
RESEND_COOLDOWN_SECONDS = 30       # per dev plan §7.1 ("Resend timer functional")
REQUEST_RATE_LIMIT = 5             # per 10 minutes
REQUEST_RATE_WINDOW = 600


@dataclass
class OtpRecord:
    code_hash: str
    attempts: int
    # Redis TTL is the single source of truth for expiry; this is for
    # diagnostic display only (not persisted separately).


def _generate_code() -> str:
    return f"{secrets.randbelow(10**CODE_LENGTH):0{CODE_LENGTH}d}"


def _hash_code(code: str) -> str:
    mac = hmac.new(settings.secret_key.encode("utf-8"), code.encode("utf-8"), hashlib.sha256)
    return mac.hexdigest()


def _constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


def _key(channel: Channel, identifier: str) -> str:
    return f"otp:{channel}:{identifier.lower()}"


def _rate_key(channel: Channel, identifier: str) -> str:
    return f"otp-rate:{channel}:{identifier.lower()}"


class OtpService:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def request(self, *, channel: Channel, identifier: str) -> None:
        """Generate, store, and deliver a code. Raises RateLimitedError if
        the identifier has requested too many codes in the window."""
        # Rate limit: 5 requests / 10 minutes / identifier.
        rate_key = _rate_key(channel, identifier)
        count = await self._redis.incr(rate_key)
        if count == 1:
            await self._redis.expire(rate_key, REQUEST_RATE_WINDOW)
        if count > REQUEST_RATE_LIMIT:
            raise RateLimitedError(
                "Too many OTP requests. Try again later.",
                code="otp_rate_limited",
            )

        code = _generate_code()
        record_value = f"{_hash_code(code)}|0"
        await self._redis.set(_key(channel, identifier), record_value, ex=OTP_TTL_SECONDS)
        await self._deliver(channel=channel, identifier=identifier, code=code)

    async def verify(self, *, channel: Channel, identifier: str, code: str) -> None:
        """Validate the code. Raises UnauthorisedError on mismatch/expiry/over-attempts.
        Deletes the record on success so the same code cannot be reused.
        """
        if not code.isdigit() or len(code) != CODE_LENGTH:
            raise ValidationError("OTP must be 6 digits.", code="invalid_otp_format")

        key = _key(channel, identifier)
        raw = await self._redis.get(key)
        if raw is None:
            raise UnauthorisedError("OTP expired or not requested.", code="otp_missing")

        stored_hash, attempts_str = raw.split("|", 1)
        attempts = int(attempts_str)
        if attempts >= MAX_VERIFY_ATTEMPTS:
            await self._redis.delete(key)
            raise UnauthorisedError(
                "Too many failed attempts. Request a new code.",
                code="otp_attempts_exceeded",
            )

        provided_hash = _hash_code(code)
        if not _constant_time_equals(stored_hash, provided_hash):
            # Increment attempt counter without extending TTL.
            ttl = await self._redis.ttl(key)
            await self._redis.set(
                key,
                f"{stored_hash}|{attempts + 1}",
                ex=ttl if ttl and ttl > 0 else OTP_TTL_SECONDS,
            )
            raise UnauthorisedError("Incorrect OTP.", code="otp_mismatch")

        await self._redis.delete(key)

    async def _deliver(self, *, channel: Channel, identifier: str, code: str) -> None:
        if channel == "email":
            email = get_email_client()
            subject = "Your BeeBop verification code"
            text = f"Your BeeBop verification code is {code}. It expires in 5 minutes."
            html = (
                f'<p>Your BeeBop verification code is <strong style="font-size:22px">'
                f"{code}</strong>.</p><p>It expires in 5 minutes. If you did not "
                f"request this, you can ignore this email.</p>"
            )
            await email.send(to=identifier, subject=subject, html=html, text=text)
            return

        whatsapp = get_whatsapp_client()
        await whatsapp.send_template(
            to=identifier,
            template_name=settings.whatsapp_otp_template_name,
            parameters=[code],
        )
