# Sprint 8 — Offer and Counter-Offer Flow

Weeks 19–20. Development Plan v3.0 §8.3.

## Acceptance criteria — coverage

| Story | Status | Notes |
|-------|--------|-------|
| **Offer submission** (post-visit + pre-visit direct) | ✅ | `POST /offers/listing/{id}` accepts price, optional move-in date, optional conditions. `requires_visit_before_acceptance` is computed at submission time — true unless the seeker already has a `COMPLETED` visit on this listing. Landlord notified via WhatsApp + in-app. |
| **Offer response (Accept / Counter / Reject)** | ✅ | Accept terminates the thread; if visit required, a `Visit(status=PENDING_ASSIGNMENT)` row is auto-created. Counter creates a new round with the turn flipped + 48h timer reset. Reject terminates with an in-app-only notification (low urgency per dev plan §12.2). |
| **48-hour response window** | ✅ | Persisted as `Offer.expires_at`. `_expiry_from_now()` = now + `OFFER_RESPONSE_WINDOW` (48h). Reset on every counter so the new responder gets the full window. |
| **Counter-offer loop — max 3 rounds** | ✅ | `MAX_OFFER_ROUNDS = 3` on both backend and frontend. Counter on a round-3 offer raises `max_rounds_exceeded` server-side; the UI hides the Counter button at the cap. |
| **Staged offer-expiry notifications** | ✅ | `offers/sweeper.py` is a Celery Beat task (every minute). Per-bucket fired-flags on `Offer.expiry_notifications_sent` make the sweeper idempotent. Hour 24 = `offer.expiring` (in-app only), Hour 36 = `offer.expiring_urgent` (email + WhatsApp + in-app), Hour 48 = `offer.expired` (transitions status, notifies both parties). Hour 0 fires synchronously inside `submit_offer` via the existing `offer.received` template. |
| **Visit-request auto-creation** | ✅ | On `accept_offer` when `requires_visit_before_acceptance` is true, a `Visit` row lands in `VisitStatus.PENDING_ASSIGNMENT`. It surfaces in the admin queue immediately. |
| **Admin manual visit assignment** | ✅ | `GET /internal/admin/visits` returns the queue. `GET /internal/admin/visits/{id}/available-agents` lists trusted agents excluded by the role-separation rule (anyone who has filed an inspection on this listing is omitted). `POST /internal/admin/visits/{id}/assign` records the assignment, sets a 2-hour confirmation deadline, and notifies the agent via WhatsApp + in-app. |

## Files added / modified

### Backend
- `app/models/_enums.py` — added `VisitStatus`.
- `app/models/visit.py` — new `Visit` model (listing, seeker, optional offer, status lifecycle, agent assignment + 2h confirmation deadline, post-visit report payload reserved for Sprint 9).
- `app/models/__init__.py` — registered `Visit`.
- `app/models/offer.py` — added `awaiting_landlord_response`, `requires_visit_before_acceptance`, `expiry_notifications_sent` (JSONB), and `MAX_OFFER_ROUNDS` constant.
- `app/offers/schemas.py`, `app/offers/service.py`, `app/offers/routes.py` — full submit/accept/counter/reject + thread reconstruction.
- `app/offers/sweeper.py` — Celery Beat task. Bucket-flagged so re-runs don't double-send. Loops over open offers per minute.
- `app/visits/__init__.py`, `app/visits/schemas.py`, `app/visits/service.py`, `app/visits/routes.py` — admin queue, available-agents lookup with role-separation enforcement, agent assignment, landlord read-only listing-scoped view.
- `app/notifications/templates.py` — `offer.accepted`, `offer.rejected`, `offer.countered`, `offer.expiring`, `offer.expiring_urgent`, `offer.expired`, `visit.assigned` templates with channel mixes per dev plan §12.2.
- `app/notifications/celery_app.py` — added the offer-expiry sweeper to Beat (every minute) and registered the new task module.
- `app/main.py` — wired `offers_router`, `visits_router` (landlord), `admin_visits_router` (admin).
- `tests/test_offer_state_machine.py`, `tests/test_visit_assignment.py` — invariant constants (`MAX_OFFER_ROUNDS`, `OFFER_RESPONSE_WINDOW`, `AGENT_CONFIRMATION_WINDOW`).

### Frontend
- `src/lib/offers.ts`, `src/lib/visits.ts` — typed wrappers for the new endpoints + `MAX_OFFER_ROUNDS` constant exported for UI gating.
- `src/components/offers/offer-modal.tsx` — Make-Offer modal with price, move-in date (rent/off-campus only), and conditions field. Wired into the listing-page CTA bar via the `onMakeOffer` prop.
- `src/components/offers/offer-thread.tsx` — Full thread renderer with countdown timer (live, minute-resolution), per-round history, status badge, Accept/Counter/Reject controls gated by `yourTurn`. Counter mode opens an inline price input. Round-cap copy when round 3 is reached.
- `src/components/offers/offers-panel.tsx` — Reusable list panel — used by both the seeker and landlord dashboards.
- `src/components/listing/cta-bar.tsx` — Each category-specific CTA component now accepts `onMakeOffer` (rent/sales/off-campus). Modal opens in-line, redirects to `/dashboard/seeker` after submission.
- `src/app/dashboard/seeker/page.tsx`, `src/app/dashboard/landlord/page.tsx` — replaced the Sprint-5 empty panels with the new `OffersPanel`.
- `src/app/internal/admin/visits/page.tsx` — admin visit queue + Assign Agent modal that reads `available-agents` (role-separation filtered) and posts the assignment.
- `src/components/admin/admin-shell.tsx` — added Visit-queue nav entry.

## Design decisions

- **Round 1 always = seeker.** The submitter parity is encoded by `round_number % 2` (odd = seeker submitted that round). This avoids storing a redundant `submitted_by` column when the round number already determines it.
- **Visit gate is computed at acceptance time, not submit time.** A seeker may have completed a visit between submitting and the landlord accepting — re-checking at accept ensures we don't create a redundant visit request when one already exists.
- **Lower-urgency rejection is in-app only.** Per dev plan §12.2 the rejection notification is "in-app only" because the lower urgency doesn't justify a WhatsApp ping. Template registered with channels=`(IN_APP,)` only.
- **Beat sweeper runs every minute.** That's high cadence for the MVP volume — bucket flags on the row keep it idempotent. We can drop to every 5 minutes without missing the hour-24/36/48 buckets if cost becomes a concern.
- **Role-separation lookup excludes anyone with any inspection (any status) on the listing.** Even a queried/rejected inspection report disqualifies them from also being the visit agent — preserves independence per dev plan §13.5.

## Known gaps / deferred

- **Agent portal + agent confirmation flow** lands in Sprint 9. The `Visit.agent_confirmed_at` and `agent_confirmation_deadline` columns are wired today but the agent-side UI to confirm is Sprint 9 scope.
- **Visit cancellation (either party) + listing re-opens to other seekers** lands in Sprint 9.
- **Post-visit report submission unlocks the seeker's post-visit offer** — Sprint 9 for the agent submission path. The data shape (`Visit.visit_report` JSONB + `visit_report_submitted_at`) is in place.
- **Landlord visits panel UI** still shows the Sprint-5 empty-panel stub — full read-only list lands with the Sprint 9 work since visit cancellation events flow through it.
- Counter "submitted_by" inference (round_number parity) holds only when no party has skipped a round — which the state machine prevents by design.

## External dependencies

No new external services. Celery Beat schedule must run alongside the workers in production for the sweeper to fire — already documented in `app/notifications/celery_app.py`.
