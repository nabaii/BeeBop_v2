# Runbook — Database recovery & Neon cutover

## What happened (2026-06)
The production database was a **Render free-tier Postgres**, which Render
**permanently deletes after its free period**. It expired with **no backups**,
so all production rows (users, listings) were lost. Symptoms: listing cards
empty, and login failing as if no accounts existed — both because the backend's
`DATABASE_URL` pointed at a database that no longer held data.

Media was unaffected (images live in Cloudinary). Redis loss only logs people
out, so it was not the cause.

## The fix: move Postgres to Neon free tier (no auto-deletion)
Backend stays on Render, frontend on Vercel. Only the database moves.

### 1. Create the Neon database
- Sign up at https://neon.tech (free, no card) → create a project.
- Copy the connection string. It looks like:
  `postgresql://user:pass@ep-xxx.region.aws.neon.tech/beebop?sslmode=require`

### 2. Point the backend at Neon
In Render → `beebop` web service → **Environment**:
- `DATABASE_URL` = the Neon string above.
  The app normalises this automatically: it strips libpq-only params
  (`sslmode`, `channel_binding`) that asyncpg rejects and adds `ssl=require`.
  See `backend/app/config.py::normalise_database_url` (covered by
  `backend/tests/test_config.py`).
- `admin_bootstrap_email`, `admin_bootstrap_password` → recreates your admin on
  boot. Same for `landlord_bootstrap_email` / `landlord_bootstrap_password`.

### 3. Deploy → schema rebuilds itself
`backend/scripts/render-build.sh` runs `alembic upgrade head` whenever
`DATABASE_URL` is set, so the deploy recreates every table.

### 4. Re-seed data
From a Render shell (or locally with `DATABASE_URL` set to Neon):
```bash
python -m scripts.seed_admin
python -m scripts.seed_beebop_landlord
python -m scripts.seed_listings        # plus seed_student_listings, etc. as needed
```
Listing images are already in Cloudinary; only the DB rows are recreated.

### 5. Verify
```bash
curl -i https://beebop.onrender.com/health         # liveness (always up)
curl -i https://beebop.onrender.com/health/ready    # 200 = DB reachable, 503 = DB down
curl -i https://beebop.onrender.com/search/listings # should return seeded listings
```

## Never lose data again: nightly backups
A free GitHub Actions backup is wired up at `.github/workflows/db-backup.yml`
(runs `backend/scripts/backup_db.sh` nightly, stores a `pg_dump` artifact).

One-time setup: add repo secret **`BACKUP_DATABASE_URL`** = the *libpq* Neon
string (the plain `postgresql://...?sslmode=require` form; pg_dump uses libpq,
not asyncpg). Trigger once via **Actions → DB Backup → Run workflow** to confirm
it produces a non-empty `.dump` artifact.

To restore a dump into a fresh database:
```bash
pg_restore --no-owner --no-privileges -d "$TARGET_LIBPQ_URL" beebop-<stamp>.dump
```

## Notes
- Redis: Render free Key-Value also expires. It only holds sessions, so loss
  just logs everyone out — acceptable, but plan to move it too before scale.
- When you can afford it, a paid Postgres with managed backups + PITR is still
  the gold standard; keep this Actions backup as a second copy.
