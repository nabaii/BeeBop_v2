"""Domain exceptions — mapped to HTTP responses in main.py."""

from __future__ import annotations


class DomainError(Exception):
    """Base class for all domain errors. Never leaked to the client directly."""

    status_code: int = 400
    code: str = "domain_error"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code


class NotFoundError(DomainError):
    status_code = 404
    code = "not_found"


class UnauthorisedError(DomainError):
    status_code = 401
    code = "unauthorised"


class ForbiddenError(DomainError):
    status_code = 403
    code = "forbidden"


class ConflictError(DomainError):
    status_code = 409
    code = "conflict"


class ValidationError(DomainError):
    status_code = 422
    code = "validation_error"


class ExternalServiceError(DomainError):
    """Upstream NIMC / CAC / Resend / WhatsApp failure."""

    status_code = 502
    code = "external_service_error"


class RateLimitedError(DomainError):
    status_code = 429
    code = "rate_limited"
