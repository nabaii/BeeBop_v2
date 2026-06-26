"""SQLAlchemy async engine, session factory, and declarative base."""

import logging
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.environment == "development",
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


async def verify_database_connection() -> None:
    """Probe the database at startup and fail loudly if it is unreachable.

    Without this, an unreachable or empty database degrades silently: listings
    queries return nothing and login can't find the user row, so the app looks
    like it "lost all the data / accounts" when really the datastore is just
    down. Raising here aborts startup with an unambiguous log line instead.
    """
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        logger.critical(
            "Database connection FAILED at startup (host=%s, db=%s). The API "
            "cannot serve users or listings until the database is reachable. "
            "If running locally: start Docker Desktop, then "
            "`docker compose up -d` to bring up the postgres container.",
            engine.url.host,
            engine.url.database,
        )
        raise


async def database_is_reachable() -> bool:
    """Lightweight liveness check for the readiness endpoint. Never raises."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        return False
    return True


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a request-scoped async session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
