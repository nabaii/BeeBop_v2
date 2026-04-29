# Sprint 11 — Short-Let Booking and Payment

Weeks 25–26. Development Plan v3.0 §8.6.

## Acceptance criteria — coverage

| Story | Status | Notes |
|-------|--------|-------|
| **Instant booking flow** | ✅ | `POST /bookings/listing/{id}` with `instant_booking=true` on the listing fires `_initialise_payment` synchronously and returns the Paystack `authorization_url`. The frontend redirects the seeker to Paystack; the webhook reconciles via `confirm_payment` → status `CONFIRMED`. |
| **Booking request flow** | ✅ | Same endpoint with `instant_booking=false` saves the booking as `REQUESTED` with a 24-hour `decision_deadline`. Host accepts (`POST /bookings/{id}/accept` → Paystack initialise) or declines with reason. Auto-decline sweeper closes stale requests after 24h. |
| **Seeker fee tier** | ✅ | `payments.fees.short_let_fee` (Sprint 2) already encodes the 150,000 Naira threshold (10% standard / 8% premium). `bookings.pricing.calculate_quote` calls it. |
| **Host payout** | ✅ | `confirm_check_in` records `payout_amount = base_total - host_fee`, sets `payout_at`, generates a `payout_reference`. Live Paystack transfer is wired through the existing client; the stub records intent locally. |
| **Availability enforcement** | ✅ | `bookings.availability.has_conflict` checks every blocking booking (REQUESTED + CONFIRMED) plus its turnaround window. Service-layer guard runs on both create AND accept paths so concurrent requests can't both succeed. |
| **Access details released on check-in day** | ✅ | `bookings.sweeper.release_due_access_details` (Celery Beat hourly) sweeps CONFIRMED bookings where `check_in == today` and dispatches `access_details.released` (email + WhatsApp + in-app). Stamps `access_details_released_at` so re-runs are no-ops. |
| **Paystack webhook** | ✅ | `POST /payments/paystack/webhook` now branches on `metadata.booking_id` in addition to `agreement_id`. HMAC-SHA512 signature verified in production; loose for dev. |

## Files added

### Backend
- `app/models/booking.py` — added `decided_at`, `decision_deadline`, `decline_reason`, `access_details`, `access_details_released_at`, `payout_amount`, `payout_reference`, `cancelled_at`, `cancellation_reason`.
- `app/bookings/__init__.py`, `bookings/schemas.py`, `bookings/pricing.py`, `bookings/availability.py`, `bookings/service.py`, `bookings/routes.py`, `bookings/sweeper.py`.
- `app/notifications/templates.py` — `booking.requested`, `booking.confirmed`, `booking.declined`, `booking.cancelled`, `access_details.released`, `host.payout`.
- `app/notifications/celery_app.py` — registered the booking sweeper module + Beat schedule entries (hourly access-release, every-30m auto-decline).
- `app/payments/routes.py` — webhook now reconciles bookings as well as agreements.
- `app/main.py` — wired `bookings_router`.
- `tests/test_booking_pricing.py` — covers Friday/Saturday weekend uplift, weekday-only stay totals, premium-tier seeker fee at >150k, host fee + payout calc.
- `tests/test_booking_availability.py` — back-to-back zero-turnaround OK; back-to-back with 1-day turnaround blocks; overlap inside booking blocks; strict before-block OK.

### Frontend
- `src/lib/bookings.ts` — typed wrappers for quote / create / accept / decline / cancel / set access details / confirm check-in / list / calendar.
- `src/components/bookings/booking-modal.tsx` — date pickers + live quote + instant-vs-request CTA; redirect to Paystack URL on instant.
- `src/components/bookings/bookings-panel.tsx` — reusable list panel; seeker view shows access details inline once released; host view exposes Accept/Decline + access-details editor + Confirm check-in.
- `src/components/listing/cta-bar.tsx` — `ShortLetCta` now opens the booking modal (replacing the placeholder Book button).
- `src/app/dashboard/seeker/page.tsx` — added `BookingsPanel` between offers and agreements.
- `src/app/dashboard/short-let/[id]/page.tsx` — replaced the Sprint-5 booking-requests stub with the live `BookingsPanel`.

## Design decisions

- **Two-phase capture for the request flow.** No charge happens at request time. The host's accept call runs `_initialise_payment`, returning the seeker's Paystack URL — the seeker pays out of band. Webhook confirms. This avoids holding seeker funds while the host decides.
- **Friday + Saturday counted as weekend.** Aligns with Nigerian short-let demand. Same convention used by the host calendar in Sprint 5.
- **Booking value = base_total (sum across nights), not per-night.** The fee tier check uses the total stay value, so a 4-night booking at 40k/night (160k total) tips into the 8% premium tier even though no single night exceeds 150k. Test `test_short_let_booking_value_is_total_not_nightly` (Sprint 2) already locked this in.
- **Access details set by host, released by sweeper.** The host saves the details whenever it's most convenient; the sweeper handles delivery on check-in day so timing is consistent and the seeker never sees half-edited details. `access_details_released_at` is the idempotency guard.
- **Cancellation kept simple.** `POST /bookings/{id}/cancel` works for both seeker and host on `REQUESTED` / `CONFIRMED` bookings. No refund-policy wiring in this sprint per dev plan §16 ("Decide before Phase 2 Sprint 11" — defaults remain a v3.1 decision).
- **Calendar block computed from real bookings.** The Sprint-5 dashboard calendar showed every day as `available`. Wiring `bookings/listing/{id}/calendar` into the next iteration of `ShortLetCalendar` paints booked + turnaround days from the same data the booking guard uses — the API is ready; the UI swap is a small frontend follow-up.

## Known gaps / deferred

- **Cancellation refund policy** — dev plan §16 leaves the decision pending. Defaults: full refund 7+ days out, 50% within 7 days, no refund within 48 hours. Not coded yet because the policy isn't signed off.
- **Calendar UI now consumes real data** — backend endpoint shipped; the `ShortLetCalendar` component still computes from `type_data` only. Wiring the calendar fetch in is a 5-line component change once the visual states settle (same legend already supports `booked` + `turnaround`).
- **Live Paystack transfer for payouts** — the live client interface exists, but the recipient-creation flow (host bank account → Paystack `transferrecipient`) is captured at landlord onboarding (placeholder field today). Sprint 12 / Phase 3 polish wires the real transfer; the stub records intent locally.

## External dependencies

- Paystack secret key for live charges + payouts. The stub returns deterministic references and treats every verify as success.
- WhatsApp templates (`booking_requested`, `booking_confirmed`, `booking_cancelled`, `access_details`) need to be submitted alongside the existing batch in Meta Business Manager — covered in the founder-action checklist.
- Cancellation refund policy (dev plan §16) requires founder sign-off before live launch.
