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
