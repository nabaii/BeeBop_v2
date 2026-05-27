#!/usr/bin/env bash
set -euo pipefail

python -m pip install --upgrade pip
python -m pip install -e .

if [[ -n "${DATABASE_URL:-}" ]]; then
  python -m alembic upgrade head
else
  echo "DATABASE_URL is not set; skipping Alembic migrations."
fi
