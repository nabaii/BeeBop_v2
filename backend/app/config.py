"""Application configuration loaded from environment variables."""

from functools import lru_cache
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# libpq/psycopg connection query params that the asyncpg driver does NOT accept
# and will raise on. Managed Postgres providers (Neon, Supabase direct, etc.)
# append these to the connection string they hand you, so we strip them and
# re-express the SSL intent in asyncpg's own terms (see _normalise_pg_url).
_LIBPQ_ONLY_PARAMS = {"sslmode", "channel_binding"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Core
    environment: Literal["development", "staging", "production"] = "development"
    secret_key: str = Field(default="change-me-in-production")
    # Public web origin — used to build shareable referral links, e.g.
    # https://www.beebop.store/r/AMINA7K2 (referral spec §2.1).
    public_web_base_url: str = "https://www.beebop.store"

    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/beebop"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalise_database_url(cls, value: str) -> str:
        """Coerce any Postgres URL into an asyncpg-compatible form.

        Two jobs:
        1. Force the asyncpg dialect (managed providers hand you a bare
           ``postgres://`` / ``postgresql://`` URL).
        2. Translate libpq-only SSL params into asyncpg's vocabulary. Neon's
           string ends with ``?sslmode=require&channel_binding=require``;
           asyncpg rejects both. We drop them and add ``ssl=require`` (which the
           SQLAlchemy asyncpg dialect understands) so a managed DB connects on
           the first try. Local URLs with no SSL params are left untouched.
        """
        if value.startswith("postgres://"):
            value = value.replace("postgres://", "postgresql+asyncpg://", 1)
        elif value.startswith("postgresql://"):
            value = value.replace("postgresql://", "postgresql+asyncpg://", 1)

        return cls._normalise_pg_url(value)

    @staticmethod
    def _normalise_pg_url(value: str) -> str:
        parts = urlsplit(value)
        if not parts.query:
            return value

        params = parse_qsl(parts.query, keep_blank_values=True)
        kept = [(k, v) for k, v in params if k not in _LIBPQ_ONLY_PARAMS]
        dropped_ssl = any(k in _LIBPQ_ONLY_PARAMS for k, _ in params)

        # If the provider asked for SSL via sslmode, preserve that intent in the
        # asyncpg-native form (unless an explicit ssl param is already present).
        if dropped_ssl and not any(k == "ssl" for k, _ in kept):
            kept.append(("ssl", "require"))

        new_query = urlencode(kept)
        return urlunsplit(parts._replace(query=new_query))

    # Redis (session context + Celery broker)
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    # The refresh token is a *sliding* idle window: every refresh issues a new
    # token and re-records its jti in Redis with a fresh TTL (see
    # auth/service.py rotate_refresh_token + refresh_store). So this value is
    # effectively "log the user out after this long with no activity". One day
    # by product decision — open the app at least once a day and you stay in;
    # miss a day and you land cleanly on the sign-in screen.
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 1
    jwt_algorithm: str = "HS256"

    # Email (Resend)
    resend_api_key: str = ""
    resend_from_email: str = "noreply@beebop.store"
    # Hard ceiling on outbound emails per UTC day, enforced in application code
    # independently of any Resend dashboard cap. A successful signup/OTP flood
    # cannot drain the prepaid balance past this. Set generously above real
    # daily volume; lower it if abuse is active.
    email_daily_send_cap: int = 2000

    # Abuse controls
    # Cloudflare Turnstile (CAPTCHA). Leave blank in development to skip
    # verification; set in staging/production to enforce it. See
    # app/integrations/turnstile.py for the unset-key policy.
    turnstile_secret_key: str = ""

    # WhatsApp Business API
    whatsapp_business_api_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_otp_template_name: str = "beebop_otp"

    # Payments (Paystack)
    paystack_secret_key: str = ""
    paystack_public_key: str = ""

    # Identity verification
    nimc_api_key: str = ""
    nimc_api_url: str = ""
    cac_api_key: str = ""
    cac_api_url: str = ""
    # Test-phase switches. When listing_document_review_required is false,
    # landlords can publish listings as live-unverified without title docs.
    listing_document_review_required: bool = False

    # LLMs
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # Maps
    google_maps_api_key: str = ""

    # Media (Cloudinary for images, S3 for documents/evidence)
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    s3_bucket: str = "beebop-documents"
    s3_region: str = "eu-west-1"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""

    # Observability
    sentry_dsn: str = ""
    posthog_api_key: str = ""

    # Production bootstrap
    # Optional first-admin seed for deployed environments where running an
    # ad-hoc shell command is inconvenient. When set, startup creates or
    # promotes this email to UserRole.ADMIN.
    admin_bootstrap_email: str = ""
    admin_bootstrap_first_name: str = "Beebop"
    admin_bootstrap_last_name: str = "Admin"
    admin_bootstrap_password: str = ""

    # Optional landlord seed for deployed environments. When set, startup creates
    # or promotes this email to UserRole.LANDLORD.
    landlord_bootstrap_email: str = ""
    landlord_bootstrap_first_name: str = "Beebop"
    landlord_bootstrap_last_name: str = "Landlord"
    landlord_bootstrap_password: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
