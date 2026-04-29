# Sprint 2 — Listing Creation (All Types, Free)

Weeks 6–7. Development Plan v3.0 §7.2.

## Acceptance criteria — coverage

| Story | Status | Notes |
|-------|--------|-------|
| Listing creation — base form | ✅ | Title, subtitle, description (min 200 chars at submit), property type (via per-category type_data), address + district, GPS pin, price. Debounced auto-save at 600 ms. |
| Listing creation — amenities | ✅ | Structured checklist, groups: power/water/security/internet/parking/kitchen/laundry. Stored as JSONB. Fixed vocabulary exposed via `GET /listings/amenities`. |
| Listing creation — photo upload | ✅ | Cloudinary signed direct upload. HTML5 drag-to-reorder. Per-photo room label. Cover selection. First upload auto-promotes to cover. Dev stub returns object URLs so the flow is demoable without Cloudinary creds. |
| Listing creation — document upload | ✅ | Private S3 presigned PUT (5-min lifetime). Dev stub points at `https://stub.local` and short-circuits in the client. Admin review uses short-expiry presigned GET (Sprint 4). |
| Student accommodation — unit type and room management | ✅ | Full CRUD. Self-contain kind silently forces `gender_tag=any`; shared rooms require female/male. Gender tag locked once a bed is occupied (service-level enforcement). |
| Short-let — availability and pricing | ✅ | Base rate, weekend rate, min stay, turnaround window, instant-booking toggle. Persisted in `type_data`; base rate mirrored to `Listing.price` for uniform card rendering. |
| Listing submission (free) | ✅ | `POST /listings/{id}/submit`. Rent/sales/short-let → `under_doc_review`. Off-campus → `live_unverified` (exempt from doc-badge gate per brief §3.1). Validation: core fields present, ≥ 1 photo, ≥ 1 document (non-off-campus), description ≥ 200 chars, category-specific Pydantic model passes. |
| Listing card component | ✅ | Per-category variants. Sales hides rating row. Unverified state visually distinct (pill + overlay). Price unit adapts (`per year`, `per night`, `total`, `starting from`). |

## Files added

### Backend
- `app/integrations/s3_storage.py` — boto3 presigned PUT / GET with a dev stub that returns `https://stub.local/...` URLs.
- `app/listings/schemas.py` — `ListingDraftPayload` (partial merge), per-category `RentTypeData` / `SalesTypeData` / `OffCampusTypeData`, `ShortLetPricingPayload`, amenity vocabulary constant, photo/doc/room/unit-type payloads.
- `app/listings/service.py` — core CRUD, draft merge semantics, `_validate_ready_for_submission`, `_validate_type_data`, photo management (upload register, reorder, cover promotion on cover delete), document management.
- `app/listings/student_inventory.py` — unit type + room CRUD with gender lock, bed count invariants, occupant-guard on delete.
- `app/listings/short_let.py` — pricing mutation with category guard + price mirroring.
- `app/listings/routes.py` — full router wired into `main.py`.

### Frontend
- `src/lib/listings.ts` — typed wrappers for every listings endpoint plus Cloudinary/S3 upload helpers with dev-stub short-circuits.
- `src/app/listings/new/page.tsx` — category chooser.
- `src/app/listings/edit/[id]/page.tsx` — editor wizard on a single scrollable page.
- `src/components/listing/base-form.tsx` — shared base fields with 600 ms debounced auto-save + status indicator.
- `src/components/listing/type-data-form.tsx` — category-specific structured fields (rent / sales / off-campus).
- `src/components/listing/amenities-checklist.tsx` — collapsible groups reading the backend vocabulary.
- `src/components/listing/photo-upload.tsx` — signed direct upload, HTML5 drag reorder, cover + label + delete.
- `src/components/listing/document-upload.tsx` — presigned PUT, doc-type chooser, per-file metadata.
- `src/components/listing/short-let-pricing.tsx` — base/weekend rate, min stay, turnaround, instant-booking toggle.
- `src/components/listing/student-inventory.tsx` — unit type CRUD + per-room gender tag (hidden on self-contain).
- `src/components/listing/listing-card.tsx` — category variants + verification-tier badge and overlay.
- `src/app/dashboard/landlord/page.tsx` — listings grid using the new card, "Create listing" action.

### Tests
- `tests/test_fees.py` — every tier boundary for rent / short-let / sales / student accommodation. Regression test for the "booking value is total, not nightly" trap.
- `tests/test_listing_submission.py` — ready-for-submission matrix: rent happy path, missing photos, missing documents, off-campus exemption, short description, short-let requires price, rent type_data Pydantic validation, sales accepts `land_only`.
- `tests/test_student_inventory.py` — gender lock behaviour skeleton (skipped pending the Postgres-enum test container in CI).

## Design decisions

- **Drag-to-reorder uses HTML5 drag events.** Zero extra deps, works across desktop and modern mobile browsers that implement the Drag API. If touch polish becomes a pain point, the swap to `@dnd-kit/sortable` is localised to `photo-upload.tsx`.
- **Price mirroring.** Short-let listings mirror `base_rate` into the `price` column so listing cards render the same regardless of category. The source of truth for dynamic pricing still lives in `type_data`.
- **Amenity vocabulary exposed via API.** The backend owns the fixed vocabulary; the UI asks for it at render time rather than hard-coding it. Adding a new amenity only requires a backend change + a migration of the JSONB shape (handled in the existing amenities map).
- **Category type_data validation deferred to submission.** The draft payload is permissive (`type_data: dict`) so a seeker can save a half-filled rent form without a 422. Only `POST /listings/{id}/submit` runs the strict Pydantic validator.
- **Off-campus exempt from doc requirement.** Aligned with Product Brief §3.1 (doc badge does not apply to student listings). Submission for off-campus routes straight to `live_unverified` — no admin review queue entry for documents; a later physical inspection can upgrade status.

## Known gaps

- Google Maps GPS pin picker is not yet embedded; landlords enter lat/lng numerically for now. The hooks are in place (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.example`) — swap lands in Sprint 3 when the map view is built.
- Landlord dashboard currently lists listings only; offers / visits / agreements panels are Sprint 5 scope.
- Admin review queue is a consumer of the submission workflow; it lands in Sprint 4. Submission here correctly creates the queue entry (listing.status = `under_doc_review`), it just has no UI yet.
- Document admin presigned-GET endpoint lands in Sprint 4 alongside the review queue.

## External dependencies

Still falls back to dev stubs for: Cloudinary, S3, NIMC, CAC, Resend, WhatsApp. Nothing in this sprint requires live credentials to develop against.
