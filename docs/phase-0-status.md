# Phase 0 — Foundation Status

Per the Development Plan v3.0 §6 (Phase 0 Tasks) and §14 (Open Prerequisites).

## ✅ Code-side deliverables (complete)

- [x] Monorepo layout — `backend/`, `frontend/`, `inspector/`, `.github/`, `docs/`
- [x] FastAPI project initialised — module scaffolded per Sprint map (auth, users, listings, verification, offers, agreements, notifications, payments, inspector, admin, ai_search, chat)
- [x] Python tooling — `pyproject.toml` with ruff, mypy, black, pytest
- [x] SQLAlchemy 2.0 async models — User, Listing, ListingPhoto, UnitType, Room, Offer, Agreement, InspectionReport, AreaScore, Badge, Booking, Notification, ChatThread, ChatMessage, Review
- [x] Alembic configured — async env.py, script template, README with workflow notes
- [x] `/health` endpoint — dependency-free, sub-100ms per dev plan §3.6
- [x] Pytest smoke test on `/health`
- [x] Next.js frontend — App Router layout, Tailwind config with verification-tier colours, Zustand stores (session, search), API client, page stubs for auth / browse / listing / all four dashboards / admin / agent
- [x] Inspector PWA — `next-pwa` scaffolded, manifest, IndexedDB helper, assignments + assessment routes stubbed
- [x] GitHub Actions — CI (backend: ruff/black/mypy/pytest with Postgres+Redis services; frontend+inspector: lint/typecheck/build)
- [x] GitHub Actions — keepalive workflow (14-min cron against backend `/health`)
- [x] Deploy workflows — staging (auto on `develop`) and production (manual dispatch with PROMOTE confirmation)
- [x] `.env.example` covering every external integration variable
- [x] `.gitignore` for Python, Node, env files, IDE artefacts

## 🚧 Founder / operations actions (external accounts and contracts)

These involve external parties with lead times outside the team's control. Every day of delay in Week 1 risks the programme timeline per dev plan §14.

### Week 1, Day 1

- [ ] **WhatsApp Business API** — Create Meta Business Manager. Apply for API access. Submit all message templates (OTP, offer notification, badge issued, agreement ready) simultaneously. Approval: 24–72 hours.
- [ ] **Anthropic and OpenAI API keys** — Obtain production keys. Set monthly budget alerts. Store in Render and Vercel env var dashboards.

### Week 1

- [ ] **NIMC API access** — Submit developer application with required business documentation.
- [ ] **CAC API access** — Submit application for CAC registration verification API.
- [ ] **Paystack merchant account** — Create and complete KYC. Configure settlement account. Obtain test and live API keys.
- [ ] **beebop.ng domain** — Purchase via NiRegistry or reseller. Point DNS nameservers to Vercel (frontend). Configure `api.beebop.ng` subdomain for Render backend.
- [ ] **Google Maps Platform** — Create GCP project. Enable Maps JavaScript API, Geocoding API, Places API. Set billing with budget alerts. The $200/month free credit covers MVP usage.
- [ ] **Hosting accounts** — Create all five: Vercel, Render, Neon, Upstash, Cloudinary. Connect GitHub repo to Vercel and Render. Obtain connection strings and API keys. Store as env vars.
- [ ] **Resend email** — Create account. Verify `beebop.ng` sending domain. Configure DKIM/SPF records on domain DNS. Test OTP email template delivery.
- [ ] **UptimeRobot** — Free account. HTTP monitor on `https://api.beebop.ng/health`. Interval: 5 minutes. Alert email configured. (Acts as primary keepalive; GitHub Actions keepalive is the backup.)
- [ ] **Sentry + PostHog** — Free-tier accounts. Connect both to frontend (Vercel) and backend (Render). Configure alert routing.

### Week 1–2

- [ ] **Property lawyer engagement** — Retain lawyer to draft tenancy agreement and sale memorandum templates. Both required before Phase 2 Sprint 10 (Week 23).

### Week 2

- [ ] **NDPR compliance review** — Engage legal counsel. Privacy policy and data-handling documentation must be ready before beta.

### By Week 12

- [ ] **Inspector recruitment** — Identify and vet 3 initial inspectors from surveying firm. Must be onboarded before beta (Week 28).
- [ ] **Trusted agent recruitment** — Identify and vet 3 trusted agents for Abuja. Must be onboarded before beta (Week 28).

### By Week 20

- [ ] **Short-let chat moderator** — Identify who will moderate short-let chats at launch. May overlap with platform admin role at low volume.

## 🎨 Design-side deliverables (UI/UX designer in Phase 0)

- [ ] **Design system documentation** — Colour palette, typography, spacing, component inventory (cards, badges, forms, modals, chat UI) in Figma. Weeks 1–2.

Tailwind tokens in `frontend/tailwind.config.ts` and `inspector/tailwind.config.ts` should mirror the Figma palette once finalised. Current values are placeholders inferred from the PDF cover styling.

## 📋 Schema review (before first migration)

Per dev plan §6.1 (SQLAlchemy models and Alembic setup), a schema review session is required before the first Alembic migration runs. Attendees:

- Technical Lead
- Backend Developer
- UI/UX Designer (to confirm dashboard-data coverage)

Once signed off, generate the initial migration:

```bash
cd backend
alembic revision --autogenerate -m "phase_0_initial_schema"
# Review the generated file carefully, particularly enum definitions and JSONB defaults.
alembic upgrade head
```

## 🎯 Phase 0 exit criteria (dev plan §6.2)

- [x] Python backend and Next.js frontend projects initialised — CI running green once dependencies install.
- [x] SQLAlchemy models committed; first Alembic migration generated and reviewed — **generation pending founder approval + schema-review session.**
- [ ] WhatsApp Business API access provisioned and OTP template approved. *(Founder action — tracked above.)*
- [ ] All API credentials stored as env vars in Render + Vercel dashboards. *(Founder action — tracked above.)*
- [ ] Design system documented in Figma. *(Designer action — tracked above.)*
- [x] Phase 1 sprint backlog populated — see `docs/phase-1-backlog.md` (**next to author**).
- [x] UptimeRobot keepalive monitor configuration documented. GitHub Actions keepalive workflow committed. `/health` endpoint live.

Once the founder-action checklist is cleared and the schema-review session complete, Phase 0 is formally closed and Sprint 1 begins.
