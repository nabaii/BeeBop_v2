# Sprint 5 — All Dashboards

Weeks 12–14. Development Plan v3.0 §7.5.

This sprint also closes **Phase 1**.

## Acceptance criteria — coverage

| Story | Status | Notes |
|-------|--------|-------|
| **Seeker** — saved listings grid with unavailability status | ✅ | Sprint 3 landed; Sprint 5 surfaces it from the dashboard with overview tiles. |
| **Seeker** — active offers list with response timer | 🟡 | Empty-state panel marked "Coming Sprint 8". Schema/timer logic lives in `app/offers/` (Sprint 8). |
| **Seeker** — agreements section with PDF download + 30-day renewal prompt | 🟡 | Empty-state panel marked "Coming Sprint 10". |
| **Landlord (standard)** — overview panel (active listings, pending actions, unread notifications) | ✅ | Stat tiles + status breakdown. Offers panel stubbed. |
| **Landlord** — listings section (six status states) | ✅ | Listing card carries the status pill; full status breakdown rendered separately. |
| **Landlord** — offers/enquiries with Accept/Counter/Reject + 48h timer | 🟡 | Empty-state panel marked "Coming Sprint 8". |
| **Landlord** — visits read-only | 🟡 | Empty-state panel marked "Coming Sprint 9". |
| **Landlord** — agreements with pending signature state | 🟡 | Empty-state panel marked "Coming Sprint 10". |
| **Landlord** — fees & billing | 🟡 | Empty-state panel marked "Coming Sprint 10" (no listing fees ever, only post-transaction commission per §4). |
| **Landlord** — analytics (views, enquiry rate, avg time to offer) | ✅ | Per-listing analytics table (views/saves/enquiries) + total-views aggregate. Avg-time-to-offer waits for Sprint 8 data. |
| **Student PMS** — unit type panel with F×N / M×N gender breakdown | ✅ | Per-unit `BreakdownTile` plus overall gender counts. |
| **Student PMS** — room grid (Occupied / Available / Vacating) | ✅ | Per-room cards with status pill derived from `beds_available`. |
| **Student PMS** — gender tag locked at DB level when occupied | ✅ | Backend constraint already in `app/listings/student_inventory.py` (Sprint 2). UI surfaces "gender locked when occupied" copy on each room. |
| **Student PMS** — enquiries action per available bed | 🟡 | Enquiries flow lands in Sprint 8 — UI shows availability counts today. |
| **Student PMS** — waitlist with gender breakdown per unit | 🟡 | Empty-state panel marked "Coming Sprint 8". |
| **Short-let** — 14-day rolling availability calendar (scrollable to 90) | ✅ | `ShortLetCalendar` component with 14/30/60/90 toggle. Backend computes day states; per-night rate (with weekend uplift) renders inline. |
| **Short-let** — day states (Available / Booked / Turnaround) | 🟡 | Available is computed today; Booked + Turnaround require the Booking table (Sprint 11) — calendar legend explicitly marks them. |
| **Short-let** — upcoming booking cards | 🟡 | Stat tile + empty-state panel marked "Coming Sprint 11". |
| **Short-let** — booking requests with Accept/Decline | 🟡 | Empty-state panel marked "Coming Sprint 11". |
| **Short-let** — pricing settings panel | ✅ | Surfaced as stat tiles with an "Edit listing" link to the existing wizard. |
| **Short-let** — revenue + occupancy analytics | 🟡 | Stat tiles present; values stubbed at zero until Sprint 11 bookings exist. |

🟡 indicates a deliberate Sprint 5 stub that will fill once the upstream sprint lands the source data. The dev plan acknowledges this dependency in §7.5 and the Phase 1 Gate.

## Files added

### Backend
- `app/notifications/schemas.py` — `NotificationView`, `InboxResponse`, `InboxFilters`.
- `app/notifications/routes.py` — `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`. In-app channel only.
- `app/dashboards/__init__.py`, `app/dashboards/schemas.py`, `app/dashboards/service.py`, `app/dashboards/routes.py`.
  - `GET /dashboard/seeker/overview`
  - `GET /dashboard/landlord/overview`
  - `GET /dashboard/landlord/analytics`
  - `GET /dashboard/student/{listing_id}` (PMS)
  - `GET /dashboard/short-let/{listing_id}?days=14..90` (calendar)
- `app/main.py` — wired `notifications_router` and `dashboards_router`.
- `tests/test_short_let_calendar.py` — day-count, sequential dates, weekend uplift on Fri/Sat, base-rate fallback, all-available state in Sprint 5 scope, `is_weekend` flag.

### Frontend
- `src/lib/notifications.ts`, `src/lib/dashboards.ts`.
- `src/components/dashboard/dashboard-sidebar.tsx` — per-role nav with sign-out + back-to-home links.
- `src/components/dashboard/notifications-inbox.tsx` — list + mark-read + mark-all-read.
- `src/components/dashboard/stat-tile.tsx`, `src/components/dashboard/empty-panel.tsx`.
- `src/components/dashboard/short-let-calendar.tsx` — colour-coded day cells with rate + weekend marker + window toggle.
- `src/app/dashboard/layout.tsx` — wired sidebar.
- `src/app/dashboard/seeker/page.tsx` — overview tiles + notifications + saved listings + offers/agreements stubs.
- `src/app/dashboard/landlord/page.tsx` — overview + status breakdown + notifications + listings + analytics + offers/visits/agreements/billing stubs.
- `src/app/dashboard/student/page.tsx` — index of off-campus listings.
- `src/app/dashboard/student/[id]/page.tsx` — full PMS view with overall gender breakdown, per-unit panels, per-room status pills, edit-inventory link, waitlist stub.
- `src/app/dashboard/short-let/page.tsx` — index of short-let listings.
- `src/app/dashboard/short-let/[id]/page.tsx` — pricing tiles + calendar + analytics tiles + booking-requests stub + edit-listing link.

## Design decisions

- **Empty-state panels signal future data.** Every "Coming Sprint N" panel is a `EmptyPanel` component so the dashboard skeleton is complete and the user (and beta testers) can see what's on the way without breaking layout.
- **Weekend uplift uses Friday + Saturday.** Aligns with Nigerian short-let demand patterns. Encoded in `dashboards.service._calendar_days`.
- **Calendar is computed, not stored.** Day states derive from the listing's `type_data` plus, eventually, joined Booking rows. No "calendar" table.
- **PMS view bypasses the Sprint 2 inventory editor.** The PMS is read-only for occupancy decisions; the underlying inventory edit lives in the listing wizard via "Edit inventory". This keeps the PMS focused on operations rather than configuration.
- **Notifications inbox is in-app only.** Email and WhatsApp deliveries are observable in `Notification.status` but not surfaced in the UI inbox — the inbox is for the user, not for engineering observability (which goes through Flower).

## Phase 1 Gate

Per the development plan, Phase 1 closes when:

> Seekers can register, browse all four categories with working filters, save listings, view full listing pages including gated valuation report. Landlords can register, create all listing types for free, and manage via dashboard. Admins can review submissions and issue document badges. Email and WhatsApp notifications dispatch correctly. Zero critical or high-severity bugs on staging.

Coverage of the gate criteria:

| Criterion | Sprint | Status |
|-----------|--------|--------|
| Seeker registration (standard) | 1 | ✅ |
| Seeker registration (student variant) | 1 | ✅ |
| Browse all four categories with working filters | 3 | ✅ |
| Save listings (and saved-listings dashboard) | 3 / 5 | ✅ |
| Listing pages with gated valuation report | 3 | ✅ (placeholder report; real generator Sprint 7) |
| Landlord registration (individual + agency) | 1 | ✅ |
| Free listing creation across all four categories | 2 | ✅ |
| Landlord dashboard | 5 | ✅ |
| Admin doc-review queue | 4 | ✅ |
| Document badge issuance | 4 | ✅ |
| Email + WhatsApp notification dispatch | 4 | ✅ (Celery + Resend + WhatsApp Business templates) |
| Zero critical / high-severity bugs on staging | — | gated on QA execution; backlog clean as of this commit |

Outstanding items before the gate can be formally signed off:

- Founder-action checklist from Phase 0 (WhatsApp Business API approval, Paystack KYC, NIMC/CAC access, Resend domain, Cloudinary, S3, Anthropic, OpenAI, Google Maps).
- First Alembic migration generated + reviewed (schema-review session noted as pending in `docs/phase-0-status.md`).
- Staging environment provisioned and CI green.
- QA stakeholder sign-off per dev plan §11.

Once those are cleared, **Phase 1 is complete** and Sprint 6 (Inspector Portal and PWA — Phase 2) can begin.

## External dependencies

Sprint 5 itself does not introduce any new external services. It consumes the data shape from Sprints 1–4. Notifications still fall back to dev-stub transports when credentials are absent.
