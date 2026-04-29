# BeeBop Frontend

Next.js App Router — seeker, landlord, student, and short-let host interfaces,
plus internal admin and trusted-agent portals.

## Requirements

- Node.js 20 LTS or later
- The backend running locally on port 8000 (see [../backend/README.md](../backend/README.md))

## Setup

```bash
cd frontend
npm install
cp ../.env.example .env.local    # set NEXT_PUBLIC_* values
```

## Run

```bash
npm run dev          # http://localhost:3000
npm run typecheck
npm run lint
npm run build        # production build
```

## Route Map

| Route | Sprint | Purpose |
|-------|--------|---------|
| `/` | 3 | Conversational main page |
| `/(auth)/login` | 1 | OTP sign-in |
| `/(auth)/register` | 1 | Seeker / landlord onboarding |
| `/browse/off-campus` | 3 | Student accommodation browse |
| `/browse/short-let` | 3 | Short-let browse |
| `/browse/rent` | 3 | Rent browse |
| `/browse/sales` | 3 | Sales browse |
| `/listings/[id]` | 3 | Listing detail (SSR) |
| `/dashboard/seeker` | 5 | Seeker home |
| `/dashboard/landlord` | 5 | Landlord home |
| `/dashboard/student` | 5 | Student accommodation PMS |
| `/dashboard/short-let` | 5 | Short-let host home |
| `/internal/admin` | 4,7,8,12 | Admin portal (role-gated) |
| `/internal/agent` | 9 | Trusted agent portal (role-gated) |

The inspector PWA is a separate app under [../inspector/](../inspector/).

## Design System

Tokens defined in [tailwind.config.ts](tailwind.config.ts):
- `brand.*` — primary navy, document page header colour
- `verification.fully | doc | unverified` — pin and badge colours
- Typography uses Inter via the Google Fonts loader (to be added Sprint 0/1)
