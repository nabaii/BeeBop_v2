"""FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.admin.inspector_routes import router as admin_inspector_router
from app.admin.routes import router as admin_router
from app.agents.routes import (
    admin_router as admin_agents_router,
)
from app.agents.routes import (
    agent_router as agents_router,
)
from app.agents.routes import (
    cancel_router as agents_cancel_router,
)
from app.agreements.routes import router as agreements_router
from app.ai_search.routes import router as ai_search_router
from app.auth.admin_bootstrap import (
    bootstrap_admin_from_settings,
    bootstrap_landlord_from_settings,
)
from app.auth.routes import router as auth_router
from app.bookings.routes import router as bookings_router
from app.bookmarks.routes import router as bookmarks_router
from app.config import get_settings
from app.core.exceptions import DomainError
from app.database import database_is_reachable, verify_database_connection
from app.dashboards.routes import router as dashboards_router
from app.inspector.routes import router as inspector_router
from app.listings.routes import router as listings_router
from app.notifications.routes import router as notifications_router
from app.offers.routes import router as offers_router
from app.payments.routes import router as payments_router
from app.referrals.routes import router as referrals_router
from app.search.routes import router as search_router
from app.users.routes import router as users_router
from app.visits.routes import (
    admin_router as admin_visits_router,
)
from app.visits.routes import (
    landlord_router as visits_router,
)

settings = get_settings()
DEV_ASSETS_DIR = Path(__file__).resolve().parents[2] / "dummy listings"

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.1 if settings.environment == "production" else 1.0,
    )


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Startup hooks go here (e.g., warming caches). Keep lightweight — Render
    # free tier cold starts matter. Heavy work belongs in Celery.
    # Fail fast and loudly if the database is unreachable, rather than booting
    # into a state that mimics "all data/accounts lost".
    await verify_database_connection()
    await bootstrap_admin_from_settings(settings)
    await bootstrap_landlord_from_settings(settings)
    yield
    # Shutdown hooks (close pools, flush analytics).


app = FastAPI(
    title="Beebop API",
    version="0.1.0",
    description="Conversational property marketplace — Nigeria.",
    lifespan=lifespan,
    # Auto-generated docs disabled in production per dev plan §3.2.
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
)

# CORS — tighten in production to the Vercel frontend domain only.
allowed_origins = (
    ["*"]
    if settings.environment == "development"
    else [
        "https://beebop.store",
        "https://www.beebop.store",
        "https://app.beebop.store",
    ]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.environment == "development" and DEV_ASSETS_DIR.exists():
    app.mount("/dev-assets", StaticFiles(directory=DEV_ASSETS_DIR), name="dev-assets")


@app.exception_handler(DomainError)
async def _handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
    """Map domain exceptions to structured JSON error responses.

    Keeping this centralised means services raise DomainError subclasses (not
    HTTPException) and stay decoupled from FastAPI at the call sites.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    """Liveness probe used by UptimeRobot and the GitHub Actions keepalive.

    Must respond in under 100ms per dev plan §3.6. Keep this endpoint
    dependency-free — no DB, no Redis, no external calls.
    """
    return {"status": "ok"}


@app.get("/health/ready", tags=["system"])
async def readiness() -> JSONResponse:
    """Readiness probe that *does* check the database.

    Unlike /health (pure liveness, dependency-free), this distinguishes a
    down/unreachable database (503) from a healthy API serving genuinely empty
    data (200). Use this when "no listings / can't log in" appears, to tell an
    infra outage apart from an application or data issue.
    """
    if await database_is_reachable():
        return JSONResponse(content={"status": "ok", "database": "up"})
    return JSONResponse(
        status_code=503,
        content={"status": "unavailable", "database": "down"},
    )


# Routers are registered here as each sprint lands them.
# Sprint 1 — auth, users.
app.include_router(auth_router)
app.include_router(users_router)
# Sprint 2 — listings.
app.include_router(listings_router)
# Sprint 3 — public search, listing detail, bookmarks.
app.include_router(search_router)
app.include_router(bookmarks_router)
# Sprint 4 — admin doc review + listing management.
app.include_router(admin_router)
# Sprint 5 — notifications inbox + per-role dashboards.
app.include_router(notifications_router)
app.include_router(dashboards_router)
# Sprint 6 — inspector portal + admin assignment.
app.include_router(inspector_router)
app.include_router(admin_inspector_router)
# Sprint 8 — offers + visit queue.
app.include_router(offers_router)
app.include_router(visits_router)
app.include_router(admin_visits_router)
# Sprint 9 — trusted-agent portal + admin visit-report review.
app.include_router(agents_router)
app.include_router(agents_cancel_router)
app.include_router(admin_agents_router)
# Sprint 10 — agreements + Paystack webhook.
app.include_router(agreements_router)
app.include_router(payments_router)
# Sprint 11 — short-let bookings.
app.include_router(bookings_router)
# Sprint 12 — chat, ai_search.
app.include_router(ai_search_router)
# Referral programme — codes, attribution at checkout, dashboard, payouts.
app.include_router(referrals_router)
