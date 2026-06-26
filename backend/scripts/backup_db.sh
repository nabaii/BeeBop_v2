#!/usr/bin/env bash
#
# Nightly logical backup of the production Postgres (Neon, Render, etc.).
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \
#     bash scripts/backup_db.sh [output_dir]
#
# Notes:
#   * Pass the *libpq* connection string (the one your provider shows, with
#     ?sslmode=require) — NOT the postgresql+asyncpg form. pg_dump uses libpq.
#   * Produces a compressed custom-format dump (-Fc), restorable with:
#       pg_restore --no-owner --no-privileges -d "$TARGET_URL" <file>
#   * --no-owner / --no-privileges keeps the dump portable across providers
#     (you can restore into a brand-new Neon/Render DB without role errors).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set to the libpq connection string}"

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/beebop-${STAMP}.dump"

echo "Dumping database -> $OUT_FILE"
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$OUT_FILE" \
  "$DATABASE_URL"

bytes="$(wc -c < "$OUT_FILE")"
echo "Backup complete: $OUT_FILE (${bytes} bytes)"

if [[ "$bytes" -lt 1024 ]]; then
  echo "WARNING: dump is suspiciously small (<1KB) — verify the database is not empty." >&2
fi
