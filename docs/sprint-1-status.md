# Sprint 1 — Authentication and User Models

Weeks 4–5. Development Plan v3.0 §7.1.

## Acceptance criteria — coverage

| Story | Status | Notes |
|-------|--------|-------|
| Seeker registration — email OTP | ✅ | Resend with dev-console stub when key missing. 6-digit codes, 5-min TTL, 5 attempts, 30s resend cooldown, 10-min rate limit. |
| Seeker registration — WhatsApp OTP | ✅ | Meta Graph API v21.0 template send with dev-console stub. Shared OTP flow. |
| Seeker onboarding — identity | ✅ | `PATCH /users/me/identity`. First/last name required. |
| Seeker onboarding — category preference | ✅ | Multi-select; no area/budget per v2.0 change. |
| Student seeker variant | ✅ | Institution, academic level, gender. Only collected when off-campus is selected. |
| Landlord registration — OTP dual-channel | ✅ | Same flow with `role_if_new=landlord`. |
| Landlord account-type selection | ✅ | Individual vs agency — routes to NIMC or CAC. |
| Landlord individual NIN verification | ✅ | `verify_nin_with_retry` — single retry on timeout; `is_timeout` flag drives admin-review UX copy. Raw NIN never persisted. |
| Landlord agency CAC verification | ✅ | Async pending fallback on timeout/202. |
| Landlord profile setup | ✅ | Photo upload Cloudinary signature endpoint; bio and operating area optional. |
| Session management | ✅ | JWT access (30 min) + refresh (14 days) with rotation and replay detection. localStorage persistence, hydrator in root layout. |
| `/health` endpoint | ✅ | Already live from Phase 0. |
| Role-based route guards | ✅ | `require_role(...)` FastAPI dep + `<RouteGuard>` client component wrapping `/dashboard/*` and `/internal/*`. |

## Files added / modified

### Backend
- `app/core/` — `exceptions.py`, `security.py` (JWT), `redis_client.py`, `dependencies.py` (current user + role guards).
- `app/integrations/` — `email_resend.py`, `whatsapp.py`, `nimc.py`, `cac.py`, `cloudinary_storage.py`. Live path + dev stub per service.
- `app/auth/` — `otp_service.py` (Redis-backed, HMAC-hashed codes), `refresh_store.py` (jti rotation), `schemas.py`, `service.py`, `routes.py`.
- `app/users/` — `schemas.py`, `service.py`, `routes.py` (onboarding steps + verification + profile + Cloudinary signature).
- `app/main.py` — router registration + `DomainError` -> JSON handler.
- `tests/` — `test_security_jwt.py`, `test_otp_service.py` (with FakeRedis), `test_nimc_retry.py`, `test_role_guards.py`, `conftest.py`.

### Frontend
- `src/stores/session.ts` — localStorage-persisted Zustand store with explicit hydrator.
- `src/lib/api.ts` — token injection + 401 refresh interceptor.
- `src/lib/auth.ts`, `src/lib/users.ts` — typed endpoint wrappers.
- `src/components/session-hydrator.tsx`, `src/components/route-guard.tsx`, `src/components/session-button.tsx`.
- `src/components/ui/` — `button.tsx`, `input.tsx`.
- `src/components/auth/otp-flow.tsx` — shared OTP entry + verify UI with resend timer.
- `src/app/(auth)/layout.tsx` + `login/page.tsx` + `register/page.tsx`.
- `src/app/onboarding/layout.tsx` + `page.tsx` + `seeker/page.tsx` + `landlord/page.tsx`.
- `src/app/dashboard/layout.tsx` + `src/app/internal/layout.tsx` — role-gated shells.
- `src/app/layout.tsx` + `src/app/page.tsx` — session hydrator mount, sign-in button on landing.

## Known gaps (not Sprint 1 scope)

- Cloudinary signature endpoint returns a stub when credentials are empty; the frontend has no photo-upload widget yet — landlords add photos later from the dashboard, but the signature route is ready.
- Institution search is free-text in Sprint 1. Seeded-list search lands when the seed data is loaded (Sprint 2 will introduce a small admin fixture step).
- Logout invalidates the refresh-token jti; the short-lived access token is left to expire naturally. This is the standard pattern for the stateless-access-token model documented in §3.2.

## External dependencies still outstanding (from Phase 0)

The running app falls back to dev stubs for: Resend, WhatsApp Business API, NIMC, CAC, Cloudinary. This is deliberate — Sprint 1 is usable end-to-end in local dev without any external account set up. The founder-action checklist in [phase-0-status.md](phase-0-status.md) still needs to clear for staging/production.

## Schema changes

None beyond the Phase 0 scaffold. `app/models/user.py` is the authoritative shape used by the onboarding flows. The first Alembic migration (still pending founder schema-review session) covers every column used here.
