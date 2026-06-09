# Beebop Inspector PWA

Offline-first progressive web app used by inspectors during field visits.

## Requirements

- Node.js 20 LTS or later
- Backend running at the URL in `NEXT_PUBLIC_API_URL`

## Setup

```bash
cd inspector
npm install
cp ../.env.example .env.local
```

## Run

```bash
npm run dev         # http://localhost:3001
npm run build       # production build (service worker generated)
```

## Offline Capability — Sprint 6

- Service worker caches the app shell and static assets via `next-pwa`.
- Form data persists to IndexedDB (`src/lib/idb.ts`) on every field change.
- Background sync dispatches queued submissions when network returns.
- A sync status indicator is always visible in the header — no silent failure.

## Route Map

| Route | Sprint | Purpose |
|-------|--------|---------|
| `/` | 6 | Home / gate to assignments or login |
| `/assignments` | 6 | Listings assigned to the signed-in inspector |
| `/assessment/[listingId]` | 6 | Property assessment form |

## Data Capture Rules

- Photos and videos carry GPS coordinates and timestamps captured via the
  browser Geolocation API — not EXIF, since some phone camera apps strip it.
- Area infrastructure scores are attached to the GPS cell (not the listing),
  so multiple listings in the same estate share scores.
- Inspectors cannot approve their own work — every submission routes through
  the admin review queue. Role separation enforced at the API level.
