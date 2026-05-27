"""Application configuration loaded from environment variables."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Core
    environment: Literal["development", "staging", "production"] = "development"
    secret_key: str = Field(default="change-me-in-production")

    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/beebop"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalise_database_url(cls, value: str) -> str:
        """Render Postgres URLs omit the asyncpg dialect by default."""
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+asyncpg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

    # Redis (session context + Celery broker)
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 14
    jwt_algorithm: str = "HS256"

    # Email (Resend)
    resend_api_key: str = ""
    resend_from_email: str = "noreply@beebop.store"

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
    admin_bootstrap_first_name: str = "BeeBop"
    admin_bootstrap_last_name: str = "Admin"


@lru_cache
def get_settings() -> Settings:
    return Settings()
