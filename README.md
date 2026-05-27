# BeeBop

Conversational property marketplace for Nigeria. Initial rollout: Abuja.

Four property categories:
- Off-campus student accommodation
- Short-let
- Long-term rent
- Sales

## Monorepo Layout

```
.
├── backend/      FastAPI + SQLAlchemy + Celery (Python 3.12+)
├── frontend/     Next.js App Router (seeker and landlord UI)
├── inspector/    Next.js PWA for field inspectors (offline-capable)
├── .github/      CI/CD and keepalive workflows
└── docs/         Product and engineering documentation
```

## Development Phases

| Phase | Weeks | Focus |
|-------|-------|-------|
| 0 | 1–3 | Foundation: infra, stack, accounts, schema, CI/CD |
| 1 | 4–14 | Core platform MVP: auth, listings, browse, admin doc review, dashboards |
| 2 | 15–27 | Verification pipeline, transactions, short-let messaging |
| 3 | 28–37 | AI/NLP layer and beta launch |
| 4 | 38–52 | Public launch, rating system, knowledge base, NLP optimisation |

## Local Development

Quick start from the repo root:

```bash
npm run dev
```

That single command starts:
- Postgres + Redis via `docker compose`
- Pending database migrations via Alembic
- FastAPI backend on `http://127.0.0.1:8000` by default
- Next.js frontend on `http://localhost:3000`

On Windows, reserved port ranges can make port `8000` fail with `EACCES`.
`npm run dev` will automatically choose the next usable backend port and pass
the matching API URL to the frontend. To force a port in PowerShell:

```powershell
$env:BACKEND_PORT=8181; npm run dev
```

If the backend Python environment has not been installed yet, set it up once:

```bash
cd backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\python -m pip install -e ".[dev]"
```

Per-service instructions live in each service's own README:
- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)
- [inspector/README.md](inspector/README.md)

## Render Backend Deployment

The FastAPI backend is a Python service rooted at `backend/`. In Render, set:

```bash
Root Directory: backend
Build Command: bash scripts/render-build.sh
Start Command: python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
PYTHON_VERSION: 3.12.13
```

The Render Blueprint service name is `beebop`, matching the existing Render
web service name. Render only applies Blueprint config to an existing service
when the `name` in `render.yaml` matches that service.

If the service is built from the repo root instead, use `pip install -e ./backend`
as the build command. Do not use bare `pip install -e`; pip requires the editable
install target path.

If Render logs still say `Running build command 'pip install -e'`, the deployed
service is using an old Dashboard build command and is not applying this
`render.yaml` service definition. In that case, update the service's Settings >
Build & Deploy > Build Command to the command above, or sync the Blueprint to
the existing service. For Blueprint syncs, the service name in `render.yaml`
must match the existing Render service name.

## Documentation

- [docs/phase-0-status.md](docs/phase-0-status.md) — Phase 0 completion status and founder-action checklist
