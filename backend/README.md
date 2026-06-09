# Beebop Backend

FastAPI application — all platform services.

## Requirements

- Python 3.12+
- PostgreSQL 15+ (locally or Neon for staging/production)
- Redis 7+ (locally or Upstash for staging/production)

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # on Windows bash: source .venv/Scripts/activate
pip install -e ".[dev]"
cp ../.env.example .env          # fill values as needed
```

## Run

```bash
# Dev server with auto-reload
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Health check
curl http://localhost:8000/health
# -> {"status":"ok"}
```

If Windows has reserved port `8000`, use the repo-level `npm run dev` command
or choose another port, for example `--port 8181`.

## Database migrations

```bash
# Generate a migration after editing models (Sprint 1+)
alembic revision --autogenerate -m "<description>"

# Apply to local DB
alembic upgrade head
```

See [alembic/README.md](alembic/README.md) for details.

## Tests / Linting

```bash
pytest
ruff check .
mypy app
black --check .
```

## Module Layout

| Module | Sprint | Purpose |
|--------|--------|---------|
| `app/auth` | 1 | JWT + OTP (email/WhatsApp), role guards |
| `app/users` | 1 | Onboarding, NIMC/CAC verification, profiles |
| `app/listings` | 2 | All four listing categories, amenities, photos, docs |
| `app/verification` | 4,7 | Doc and physical badge pipelines, valuation report |
| `app/admin` | 4 | Admin portal — doc review, inspection review, moderation |
| `app/inspector` | 6 | Inspector assessments, area scoring, offline sync |
| `app/offers` | 8 | Offer / counter-offer state machine |
| `app/agreements` | 10 | Agreement PDF generation, OTP signing |
| `app/payments` | 10,11 | Paystack — facilitation fees, short-let payments, payouts |
| `app/notifications` | 4+ | Email/WhatsApp/in-app dispatch via Celery |
| `app/chat` | 12 | Short-let in-booking group chat (WebSocket + moderation) |
| `app/ai_search` | 13 | Conversational search — Claude primary, GPT-4o fallback |

## Background workers (Sprint 4+)

```bash
# Celery worker
celery -A app.workers worker --loglevel=info

# Celery beat (scheduled jobs: offer expiry, renewal prompts, award badges)
celery -A app.workers beat --loglevel=info
```
