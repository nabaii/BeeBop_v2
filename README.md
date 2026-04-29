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

Per-service instructions live in each service's own README:
- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)
- [inspector/README.md](inspector/README.md)

## Documentation

- [docs/phase-0-status.md](docs/phase-0-status.md) — Phase 0 completion status and founder-action checklist
