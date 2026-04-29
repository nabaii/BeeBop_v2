# BeeBop Architecture — Reference

A single-page architecture reference for new contributors. Full detail in the
Product Brief and Development Plan.

## Separation principle (dev plan §3)

> Python owns all backend services. JavaScript/TypeScript owns all browser interfaces. This separation is clean, enforced at the repo level, and not crossed.

## Services

```
┌─────────────────┐       ┌─────────────────┐       ┌──────────────────┐
│   frontend/     │       │   inspector/    │       │    backend/      │
│   Next.js       │       │   Next.js PWA   │       │    FastAPI       │
│   Vercel        │◄─────►│   Vercel        │◄─────►│    Render        │
│   seeker +      │ HTTPS │   inspectors    │ HTTPS │    Celery        │
│   landlord +    │  WS   │   offline-first │       │    workers       │
│   admin UI      │       │                 │       │                  │
└─────────────────┘       └─────────────────┘       └───┬──────┬───────┘
                                                        │      │
                                                 ┌──────▼──┐ ┌─▼────────┐
                                                 │  Neon   │ │ Upstash  │
                                                 │ Postgres│ │  Redis   │
                                                 └─────────┘ └──────────┘
```

## Data stores

| Store | Purpose | MVP provider | Upgrade path |
|-------|---------|--------------|--------------|
| PostgreSQL | Relational data (users, listings, offers, etc.) | Neon free tier | Neon Pro |
| Redis | Session context (30-min TTL), Celery broker, listing-card cache | Upstash free | Upstash pay-as-you-go |
| S3-compatible | Inspector evidence, agreement PDFs, listing documents | (AWS S3) | — |
| Cloudinary | Listing photos with auto-transformations | Cloudinary free | Cloudinary Plus |
| Query log archive | Raw conversation turns for vocabulary expansion | S3 | — |

## Authentication

- OTP via email (Resend, primary) and WhatsApp Business API (alternative).
- JWT access token (30 min) + refresh token (14 days) with rotation.
- No passwords.
- Roles: `seeker`, `landlord`, `agent`, `inspector`, `trusted_agent`, `admin`.
- Route guards enforce role at the FastAPI dependency layer.

## AI / NLP pipeline (Sprint 13)

Five stages, session-scoped, no persistent chat history:

1. **Intent classification** — search / clarification / information / transactional
2. **Vocabulary normalisation** — Nigerian housing terms (self-con, BQ, 2-in-1, etc.)
3. **Parameter extraction** — Claude returns structured JSON validated by Pydantic
4. **Reference resolution** — "the third one", "ones with a generator" against current session result set
5. **Result ranking** — verification status (highest), rating, parameter-match, recency, price (light)

Fallback chain: Claude retry (max 2) → PostgreSQL FTS with raw query.

## Verification pipeline (Phase 2)

Two badges, independent issuance:

- **Document badge** — admin-approved title docs. 24-month expiry. Student exempt.
- **Physical badge** — inspector physical visit + admin approval. 12-month expiry.
- **Fully Verified** — derived designation when both are active.

Inspectors and trusted agents cannot approve their own work. Role separation enforced at admin-assignment time and at the API level — the same person cannot be both inspector and visit agent for the same listing.

## Transaction flows

- **Rent / student / sales** — offer → (visit if required) → acceptance → agreement PDF generated → OTP-signed by both parties → Paystack facilitation fee charged / invoice generated → listing status flipped.
- **Short-let** — instant booking or request → Paystack payment captured on confirmation → group chat thread auto-created (seeker + host + BeeBop moderator) → access details released on check-in day → host payout after check-in confirmation.

Fee calculation detail: dev plan §4. Every tier boundary has unit tests.

## Communications

- **Email (Resend)** — OTPs, formal documents, receipts. Primary for documents.
- **WhatsApp Business API** — time-sensitive transaction alerts. Approved templates only.
- **In-app WebSocket** — real-time complement to email/WhatsApp.
- **Off-platform phone/WhatsApp of parties** — forbidden by design. Enforced in chat with content filter.
- **SMS** — removed entirely (v2.0 change).

## Keepalive strategy — Render free tier

Render spins down after 15 minutes idle. Two pingers prevent this:

1. **UptimeRobot** (primary) — 5-minute HTTP GET `/health`.
2. **GitHub Actions scheduled workflow** (backup) — 14-minute cron on `/health`.

Both disabled once Render is upgraded to Starter ($7/month) before Phase 3 beta.

## Repos, branches, environments

- `main` → production
- `develop` → staging (auto-deploy via Render webhook)
- feature branches → PRs against `develop`
- Manual promotion to production via GitHub Actions `workflow_dispatch`.
