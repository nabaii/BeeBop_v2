"""Fixed-window rate limiting on top of the shared Redis instance.

Used to constrain abuse on the public auth endpoints. The OTP store already
rate-limits *per identifier*; this adds a *per-IP* layer so an attacker cannot
sidestep the identifier limit by rotating Gmail dot-variants (each of which
looks like a distinct identifier before canonicalisation).

Keys expire automatically, so there is nothing to clean up.
"""

from __future__ import annotations

from fastapi import Request
from redis.asyncio import Redis

from app.core.exceptions import RateLimitedError


def client_ip(request: Request) -> str:
    """Best-effort real client IP, honouring the proxy chain.

    In production the app sits behind Cloudflare and Render, so the socket peer
    is a proxy, not the user. Cloudflare sets ``CF-Connecting-IP``; standard
    proxies append to ``X-Forwarded-For`` (first hop is the original client).
    Falls back to the socket address for local/dev requests.
    """
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


async def enforce_rate_limit(
    redis: Redis,
    *,
    scope: str,
    key: str,
    limit: int,
    window_seconds: int,
    message: str = "Too many requests. Please slow down and try again shortly.",
    code: str = "rate_limited",
) -> None:
    """Increment a fixed-window counter and raise once it exceeds ``limit``.

    ``scope`` namespaces the limiter (e.g. ``"otp-request-ip"``) and ``key`` is
    the per-subject discriminator (an IP address or canonical email).
    """
    redis_key = f"rl:{scope}:{key}"
    count = await redis.incr(redis_key)
    if count == 1:
        await redis.expire(redis_key, window_seconds)
    if count > limit:
        raise RateLimitedError(message, code=code)
