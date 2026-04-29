# Sprint 4 — Admin Portal and Document Review

Weeks 10–11. Development Plan v3.0 §7.4.

## Acceptance criteria — coverage

| Story | Status | Notes |
|-------|--------|-------|
| Admin authentication | ✅ | `/internal/admin/*` mounted under `require_role(UserRole.ADMIN)` (router-level dependency). Frontend `RouteGuard` re-asserts. First admin seeded via `python -m scripts.seed_admin`. |
| Document review queue | ✅ | `GET /internal/admin/doc-review` returns oldest-first list with title, landlord name, submission date, doc count. Approve / Query / Reject endpoints land state transitions and notifications. Query requires a note (validated server-side). |
| Document viewer | ✅ | `GET /internal/admin/listings/{id}/documents/{doc_id}/url` returns a 15-min presigned GET. Frontend modal renders PDFs in an `<iframe>` and images directly. URL never persisted client-side; refetched per open. |
| Badge issuance — document badge | ✅ | `verification.badges.issue_doc_badge` creates a `BadgeType.DOCUMENT` row with 24-month expiry on approval. Audit-logged with badge id. `badge.issued` notification dispatched (email + WhatsApp + in-app). |
| Listing management | ✅ | `GET /internal/admin/listings` with status/category/text filters and pagination. `PATCH` for inline edits (title/subtitle/description/district/price). `POST /suspend`, `POST /restore`, `DELETE` (soft-delete). Every mutation writes an `AdminAuditLog` entry with before/after payload where applicable. |
| Notification service — core events | ✅ | `notifications.dispatch.dispatch_notification` writes one `Notification` row per channel and queues delivery. Templates registered in `notifications.templates.REGISTRY`: `badge.issued`, `listing.queried`, `listing.rejected`, `offer.received`, `otp.requested`. Email + WhatsApp + in-app channels. |
| WhatsApp template integration | ✅ | All WhatsApp messages route through `MetaWhatsAppClient.send_template`. Template names + parameters come from the registry. Free-form WhatsApp is a no-op — there is no fallback path. Failures captured in `Notification.failure_reason`. |
| Celery worker setup | ✅ | `notifications.celery_app.celery_app` with Redis broker + result backend. Tasks: `deliver_email`, `deliver_whatsapp` with exponential-backoff retry (60s × 2ⁿ, max 3), `broker_liveness` on Beat (daily 00:00 Africa/Lagos). Worker run command + Flower instructions in module docstring. |

## Files added

### Backend
- `app/models/audit_log.py` — `AdminAuditLog` (entity_type/id, action, JSONB payload).
- `app/models/listing.py` — added `suspended_at`, `suspension_reason`, `deleted_at`, `review_note` columns. Required-at-submission fields are nullable for draft support (already from Sprint 2).
- `app/admin/schemas.py`, `app/admin/audit.py`, `app/admin/service.py`, `app/admin/routes.py`.
- `app/verification/badges.py` — issue/revoke helpers + `listing_has_active_badge` lookup. Constants `DOC_BADGE_LIFETIME` (24 mo), `PHYSICAL_BADGE_LIFETIME` (12 mo).
- `app/notifications/templates.py` — registry of `Template` records with channel + render functions.
- `app/notifications/dispatch.py` — write-then-enqueue.
- `app/notifications/celery_app.py` — Redis-backed Celery app with Beat schedule.
- `app/notifications/tasks.py` — `deliver_email`, `deliver_whatsapp`, `broker_liveness`. Failure capture into `Notification.failure_reason`.
- `scripts/seed_admin.py` — idempotent first-admin seed.
- `app/main.py` — wired `admin_router`.

### Frontend
- `src/lib/admin.ts` — typed wrappers for every endpoint.
- `src/components/admin/admin-shell.tsx` — left-rail nav (Doc review queue + All listings) + sign-out.
- `src/components/admin/doc-viewer.tsx` — modal with PDF iframe / image preview using fresh presigned URL.
- `src/app/internal/admin/layout.tsx` — `RouteGuard roles={['admin']}` + AdminShell.
- `src/app/internal/admin/page.tsx` — full doc-review queue + side drawer with description, document list, approve/query/reject + note field.
- `src/app/internal/admin/listings/page.tsx` — paginated listings table with status/category pill filters, search, suspend/restore/soft-delete row actions.

### Tests
- `tests/test_notification_templates.py` — registry coverage for every Sprint-4 event, channel mix per event, OTP template name from settings.
- `tests/test_badge_lifetime.py` — guards the 24/12-month constants against accidental drift.

## Design decisions

- **Audit log is generic.** One `AdminAuditLog` table covers listings now and inspections / users / agreements later. Action strings are namespaced (`doc.approve`, `listing.suspend`) so future filtering is easy.
- **Query reverts to DRAFT, reject suspends.** Query is a soft "fix and resubmit" path that keeps the listing editable for the landlord. Reject is a stop — listing is hidden until admin manually restores or the landlord deletes. Both surface a note that the landlord sees.
- **Notification dispatch is write-then-enqueue.** The DB row is the source of truth; Celery delivery just transitions its status. This makes retries idempotent and lets the in-app gateway (Sprint 5 WebSocket) pick up rows without coupling to Celery.
- **Off-campus exemption from the queue.** Per product brief §3.1, off-campus listings skip the doc-badge gate entirely — they never enter `UNDER_DOC_REVIEW` and never appear here. Sprint 2 already wires this in `submit_listing`.
- **Document URLs are not stored.** The viewer fetches a fresh presigned GET on every open and discards it on close. 15-min lifetime per dev plan §7.4.

## Known gaps / deferred

- Inline edit form on the All Listings page is title/subtitle/description/district/price only. Full editor (amenities, photos, type_data) reuses the existing landlord wizard — admins can navigate to `/listings/edit/{id}` if they need everything (the wizard does ownership checks; admin path bypass would require a small `is_admin` overlay added in a later sprint).
- WebSocket gateway for in-app notifications is scaffolded by the data shape but the actual websocket endpoint lands in Sprint 5 alongside the dashboards work.
- Audit-log viewer page (admin self-audit) deferred — entries are written today and queryable via the DB, but no UI yet.
- Flower observability is documented in the Celery module docstring; no provisioning included (it's an external process started alongside the worker).

## External dependencies

Email goes through Resend; WhatsApp goes through Meta Graph API. Both fall back to dev-console stubs when the credentials are absent — Sprint 4 is fully demoable end-to-end without live services. Celery requires Redis; Upstash free tier covers MVP volume.
