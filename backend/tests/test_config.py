from app.config import Settings


def test_database_url_accepts_render_postgres_scheme(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@example.com:5432/beebop")

    settings = Settings()

    assert settings.database_url == "postgresql+asyncpg://user:pass@example.com:5432/beebop"


def test_database_url_accepts_render_postgresql_scheme(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@example.com:5432/beebop")

    settings = Settings()

    assert settings.database_url == "postgresql+asyncpg://user:pass@example.com:5432/beebop"


def test_database_url_preserves_explicit_async_driver(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@example.com:5432/beebop")

    settings = Settings()

    assert settings.database_url == "postgresql+asyncpg://user:pass@example.com:5432/beebop"


def test_database_url_translates_neon_ssl_params(monkeypatch) -> None:
    # Neon hands you libpq-only params that asyncpg rejects; they must become
    # asyncpg's ssl=require so the connection succeeds.
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://u:p@ep-x.aws.neon.tech/beebop?sslmode=require&channel_binding=require",
    )

    settings = Settings()

    assert settings.database_url == (
        "postgresql+asyncpg://u:p@ep-x.aws.neon.tech/beebop?ssl=require"
    )


def test_database_url_leaves_local_docker_url_untouched(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:password@localhost:5432/beebop")

    settings = Settings()

    assert settings.database_url == "postgresql+asyncpg://user:password@localhost:5432/beebop"


def test_database_url_respects_explicit_ssl_param(monkeypatch) -> None:
    # If the operator already set ssl explicitly, don't override it.
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db?sslmode=require&ssl=verify-full")

    settings = Settings()

    assert settings.database_url == "postgresql+asyncpg://u:p@host/db?ssl=verify-full"
