"""Area-score upsert and GPS-cell snapping.

Per product brief §3.2 area scores live against GPS coordinates so multiple
listings in the same estate share a single record. We snap raw GPS to a
fixed grid cell (default ~110 metres in latitude — 0.001°). This keeps
estates clustered without hand-curated boundaries.

Admin can edit scores at any time independent of badge status — this module
exposes the upsert path; admin routes call it directly.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inspection import AreaScore

# 0.001° latitude ≈ 111 m. 0.001° longitude ≈ 100 m at Abuja's latitude (~9°).
# Good enough granularity for estate-scoped scores; adjustable when needed.
CELL_PRECISION = 3


def snap_to_cell(lat: float, lng: float) -> tuple[float, float]:
    """Snap a coordinate to the lower-left anchor of its grid cell."""
    factor = 10**CELL_PRECISION
    cell_lat = int(lat * factor) / factor
    cell_lng = int(lng * factor) / factor
    return cell_lat, cell_lng


@dataclass
class AreaScorePayload:
    road_condition: int | None = None
    electricity_supply_hours: int | None = None
    security: int | None = None
    proximity: int | None = None
    landmarks: list[dict] | None = None


async def upsert_area_score(
    *, lat: float, lng: float, payload: AreaScorePayload, source: str, db: AsyncSession
) -> AreaScore:
    cell_lat, cell_lng = snap_to_cell(lat, lng)
    stmt = select(AreaScore).where(
        AreaScore.cell_lat == cell_lat, AreaScore.cell_lng == cell_lng
    )
    record = (await db.execute(stmt)).scalar_one_or_none()
    if record is None:
        record = AreaScore(cell_lat=cell_lat, cell_lng=cell_lng)
        db.add(record)

    if payload.road_condition is not None:
        record.road_condition = payload.road_condition
    if payload.electricity_supply_hours is not None:
        record.electricity_supply_hours = payload.electricity_supply_hours
    if payload.security is not None:
        record.security = payload.security
    if payload.proximity is not None:
        record.proximity = payload.proximity
    if payload.landmarks is not None:
        record.landmarks = payload.landmarks

    record.last_assessed_at = datetime.now(timezone.utc)
    record.source = source
    await db.flush()
    return record
