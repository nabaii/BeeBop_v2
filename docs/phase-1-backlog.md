# Phase 1 Sprint Backlog

11 weeks / 5 sprints. Per Development Plan v3.0 §7.

## Sprint 1 — Weeks 4–5: Authentication and User Models

**Goal:** Users can register via email OTP or WhatsApp OTP, complete onboarding, and reach their appropriate home screen.

- Seeker registration — email OTP (Resend) and WhatsApp OTP alternative
- Seeker onboarding — basic identity (first/last name), category preference (multi-select), student variant (institution + academic level + gender)
- Landlord registration — same OTP flow, role stored as landlord
- Landlord account type selection — individual vs agency (routes to different verification paths)
- Landlord individual — NIN verification via NIMC with retry logic; third-failure admin flag
- Landlord agency — CAC number verification via CAC API with async fallback
- Landlord profile setup — photo (S3 presigned URL), bio, operating area, agency logo/size
- Session management — JWT access + refresh rotation, persistent session across reloads
- `/health` endpoint — dependency-free, <100ms
- Role-based route guards — 401 unauth, 403 wrong role

## Sprint 2 — Weeks 6–7: Listing Creation (All Types, Free)

**Goal:** Landlords can create listings across all four categories at no cost.

- Listing creation base form — title, subtitle, description (min 200 chars), property type, category, address with GPS pin, price; draft auto-save
- Amenities checklist — Power/Water/Security/Internet/Parking/Kitchen/Laundry stored as structured JSONB
- Photo upload — S3 presigned URLs, drag-to-reorder, room labelling, cover selection
- Document upload — PDF + image, S3 private bucket, short-expiry presigned URLs for admin
- Student accommodation inventory — unit types, rooms, gender tag enforced at DB level on occupancy
- Short-let availability & pricing — base rate, weekend rate, min stay, turnaround window, instant booking toggle
- Listing submission — free; transitions to `under_doc_review`; landlord notified
- Listing card component — variants by category; sales hides rating; unverified visually distinct

## Sprint 3 — Weeks 8–9: Seeker Discovery — Browse and Listing Page

**Goal:** Logged-in seekers can browse all four categories with working filters. Listing pages accessible to unauthenticated visitors (valuation report gated).

- Main page layout — sidebar (New Chat, category links), centred Ask BeeBop input, featured listings carousel
- Four category browse pages — shared filters + category-specific filters; verification tier defaults pre-checked
- Map view toggle — Abuja pin map, verification-tier colour coding, click-to-preview card overlay
- Listing page core sections — gallery (room-grouped, inspector walkthrough separate), description, amenities (confirmed indicators after Sprint 7), approximate map pin
- Fixed CTA bar — type-specific actions, sign-in redirect with return URL
- Valuation report section — gated behind login, locked panel with description for logged-out users
- Bookmark / save listing — dashboard integration, unavailability marking on status change

## Sprint 4 — Weeks 10–11: Admin Portal and Document Review

**Goal:** Admin can log into the internal portal, review document submissions, approve or query listings, and issue document badges.

- Admin authentication — internal route; admin role required for all `/internal/*` routes
- Document review queue — sorted oldest first; Approve/Query/Reject actions
- In-portal PDF + image viewer — short-expiry S3 presigned URLs, no download required
- Badge issuance — doc badge record (24-month expiry); listing status updated; notifications dispatched
- Listing management — admin view of all listings; edit, suspend, soft-delete
- Notification service (core events) — email (Resend), WhatsApp (Business API templates), in-app WebSocket
- WhatsApp template integration — approved templates only; failed delivery logged
- Celery worker setup — dispatch tasks defined; Celery Beat scheduler for offer expiry timers (prep for Sprint 8)

## Sprint 5 — Weeks 12–14: All Dashboards

**Goal:** Seeker, landlord (standard), student accommodation, and short-let dashboards complete.

- Seeker dashboard — saved listings, active offers with timers, agreements with renewal prompt
- Landlord dashboard — overview, listings (six statuses), offers with 48-hour timer, visits (read-only), agreements, billing, analytics
- Student accommodation PMS — unit type panels, room grid with bed states, gender tag lock, waitlist
- Short-let host dashboard — availability calendar (14-day rolling, scroll to 90 days), upcoming bookings, booking requests with Accept/Decline, pricing panel, analytics

## Phase 1 Gate

Seekers can register, browse all categories with working filters, save listings, view listing pages (including gated valuation report). Landlords can register, create all listing types for free, and manage via dashboard. Admins can review submissions and issue document badges. Email and WhatsApp notifications dispatch correctly. **Zero critical or high-severity bugs on staging.**
