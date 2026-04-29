# Sprint 10 — Agreement Generation, Signing and Fees

Weeks 23–25. Development Plan v3.0 §8.5.

> **Founder prerequisite (dev plan §8.5 + §14):** the property lawyer must
> sign off on the tenancy and sale memorandum templates *before* this sprint
> ships to staging. The PDF renderer in `app/agreements/pdf.py` produces the
> agreed structured layout — the wording inside is placeholder language until
> legal review lands. Tracked in [phase-0-status.md](phase-0-status.md).

## Acceptance criteria — coverage

| Story | Status | Notes |
|-------|--------|-------|
| **Tenancy/sale agreement generation** | ✅ | `generate_agreement_for_offer` runs from two hooks: `offer.accept` (when no visit is required — i.e. the seeker has a previously completed visit on this listing) and `admin_approve_visit_report` (the post-visit-report-approved path). Pre-filled from listing + offer + parties. PDF rendered via ReportLab and stored at `agreements/{id}/agreement.pdf` in S3. Structured payload persisted in `Agreement.rendered_data`. |
| **OTP-confirmed signing** | ✅ | Two endpoints: `POST /agreements/{id}/signature/otp` (request a code via email or WhatsApp) and `POST /agreements/{id}/signature` (verify + record). Signature payload: `{ party, channel, signed_at }` appended to `Agreement.signatures` (audit trail). PDF re-rendered after each signature so the latest copy includes the signature lines. |
| **Agreement storage and download** | ✅ | `GET /agreements/{id}/download` returns a 15-minute presigned S3 GET. Sales agreements with `status=PENDING_PAYMENT` raise `sales_pdf_withheld` per dev plan §4.4 — the PDF unlocks once the seller's invoice is paid. |
| **Rent facilitation fee — Paystack** | ✅ | `_initiate_payments` for `RENT` charges landlord and seeker independently using `payments.fees.rent_fee` (already covers standard/premium tiers). Two Paystack `initialise_payment` calls; references stored in `landlord_payment_reference` + `seeker_payment_reference`. |
| **Student accommodation fee — Paystack** | ✅ | Same pattern as rent, using `student_accommodation_fee`. Owner 2.5% + seeker 3%, charged independently. |
| **Sales fee — Paystack invoice to seller** | ✅ | `paystack.create_invoice` with 48-hour due window. `Agreement.sales_invoice_reference` + `sales_invoice_due_at`. Seller notified via `sales.invoice_issued` template. Signed PDF withheld until invoice paid. |
| **Listing status update on signing** | ✅ | `confirm_payment` flips listing to `LET_AGREED` (rent/student) or `SALE_AGREED` (sales) once all required legs verify successful via Paystack. Status update triggers the `agreement.signed` notification to both parties. |
| **Renewal flow** | ✅ | `app/agreements/renewal.py` — Celery Beat task `agreement-renewal-sweeper` runs daily at 09:30 Africa/Lagos. Walks `ACTIVE` tenancy agreements with `end_date` in the next 30 days that haven't been prompted yet. Dispatches `agreement.renewal_prompt` and stamps `renewal_prompted_at`. The actual renewal flow + 10k Naira fee is initiated when the landlord clicks Renew (Sprint 11+ wiring). |

## Files added / modified

### Backend
- `app/integrations/paystack.py` — Live `LivePaystackClient` (initialise_payment, create_invoice, verify) + `StubPaystackClient` for dev. `make_reference()` helper for client-side reference generation.
- `app/models/agreement.py` — added `rendered_data`, `sales_invoice_reference`, `sales_invoice_due_at`, `landlord_fee_total`, `seeker_fee_total`, `seller_fee_total`, `landlord_payment_reference`, `seeker_payment_reference`, `renewed_into_id`, `renewal_prompted_at`.
- `app/agreements/pdf.py` — ReportLab renderer producing A4 PDFs with header, parties, commercial terms, conditions, BeeBop facilitation clause, signature lines.
- `app/agreements/schemas.py`, `app/agreements/service.py`, `app/agreements/routes.py` — full agreement lifecycle (generation, signing, payments, download).
- `app/agreements/renewal.py` — Celery Beat sweeper.
- `app/payments/routes.py` — Paystack webhook with HMAC-SHA512 signature verification (loose for dev environment).
- `app/notifications/templates.py` — `agreement.ready_to_sign`, `agreement.signed`, `sales.invoice_issued`, `agreement.renewal_prompt`.
- `app/notifications/celery_app.py` — registered the renewal sweeper module + Beat schedule entry.
- `app/offers/service.py` — `accept_offer` now triggers agreement generation when no visit is required (i.e. seeker already had a completed visit).
- `app/agents/service.py` — `admin_approve_visit_report` triggers agreement generation for the originating offer (the post-visit unlock per dev plan §13.4).
- `app/main.py` — wired `agreements_router` and `payments_router`.
- `tests/test_paystack_stub.py` — stub-client smoke tests covering reference echoing, future due dates, success-on-verify.

### Frontend
- `src/lib/agreements.ts` — typed wrappers (`listMine`, `detail`, `requestOtp`, `sign`, `download`).
- `src/components/agreements/agreements-panel.tsx` — reusable panel for seeker + landlord dashboards. Per-row "Sign now" badge when the viewer's signature is missing.
- `src/app/agreements/[id]/page.tsx` — full detail page: parties + commercial terms, signatures progress (✓ × 2 / ○ × 2), OTP-confirmed sign card (email or WhatsApp), payment summary card (per-party fees for rent/student, sales-invoice readout for sales), PDF download (locked for sales pre-payment).
- `src/app/dashboard/seeker/page.tsx` and `src/app/dashboard/landlord/page.tsx` — replaced the Sprint-5 empty agreements panels with the live `AgreementsPanel`.

## Design decisions

- **PDF rendering uses ReportLab, not WeasyPrint.** WeasyPrint pulls system libs (cairo, pango) that Render's Python runtime doesn't ship by default; ReportLab is pure-Python and renders the platform's structured fields cleanly. Switching to WeasyPrint later for richer typography is a single-file change.
- **Agreement generation is hooked from two paths.** When a seeker submits an offer on a listing where they've already completed a visit, the visit gate is skipped and `accept_offer` itself triggers generation. Otherwise the visit pipeline must complete; the admin's visit-report approval is the gate.
- **Invoice withholding is enforced server-side.** `presigned_download` rejects sales-PDF requests in `PENDING_PAYMENT` with `sales_pdf_withheld` — the frontend just mirrors that check for UX. There's no way to bypass via direct API call.
- **Per-leg payment references stored separately.** Rent + student have two parallel charges (landlord/owner and seeker). Storing references in dedicated columns avoids fragile JSON parsing when reconciling webhooks. `paystack_reference` carries the most recently confirmed leg for backward-compat with §3.2's audit log.
- **Renewal sweeper sets `renewal_prompted_at` once.** Subsequent runs skip prompted agreements until the landlord either (a) initiates a renewal that creates a new agreement and links via `renewed_into_id` or (b) lets the agreement expire. Avoids spamming the landlord daily.

## Known gaps / deferred

- **Renewal flow click-through** — the prompt notification arrives, but the simplified-agreement creation flow + 10k Naira renewal fee charge is wired in Sprint 11's polish pass alongside the booking work. The data model already supports it (`renewed_into_id`).
- **Sales invoice URL** — Paystack returns a `request_code` we can render as `https://paystack.shop/pay/{code}`; the live client today returns the offline reference. Frontend renders whichever URL is present in `sales_invoice_url` once the live integration goes through.
- **Webhook idempotency** — relies on `confirm_payment`'s status guard (already-SIGNED agreements skip the listing flip). A dedicated `webhook_events` log lands in the security-audit pass before beta.
- **Agreement re-render on signature** — currently runs synchronously inside `submit_signature`. For higher signature volume this should move to a Celery task; the function is already idempotent.

## External dependencies

- Paystack secret key required for live charges. Without it the dev stub returns deterministic references and `verify` always succeeds — the rest of the pipeline (listing status flip, notifications, listing-card update) runs end-to-end locally.
- Property-lawyer template sign-off is a Phase 0 founder action; the engine renders whatever structure the lawyer approves.
- WhatsApp templates (`agreement_ready`) need to be submitted alongside the existing batch in Meta Business Manager.
