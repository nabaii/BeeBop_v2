/**
 * Featured tiles — the headline row on the public listing page. A landlord may
 * "star" amenities *and* house rules; both compete for the same row, so the cap
 * is a single shared budget rather than two independent ones.
 *
 * For off-campus listings the drive-time-to-campus tile is rendered
 * automatically and occupies one slot, leaving fewer for starred items. These
 * helpers are the single source of truth shared by the two editor checklists
 * (amenities + house rules) and the public render.
 */

// Headline tiles render as one tidy row of four (see `FeaturedTiles`).
export const MAX_FEATURED_TILES = 4;

type AmenityMeta = { present?: boolean; featured?: boolean };
type AmenityMap = Record<string, Record<string, AmenityMeta> | null> | null | undefined;

type RuleMeta = { present?: boolean; featured?: boolean };
type HouseRuleMap = Record<string, RuleMeta> | null | undefined;

/** Present amenities the landlord starred to feature. */
export function countFeaturedAmenities(amenities: AmenityMap): number {
  let n = 0;
  for (const items of Object.values(amenities ?? {})) {
    if (!items) continue;
    for (const meta of Object.values(items)) {
      if (meta?.present && meta?.featured) n += 1;
    }
  }
  return n;
}

/** Present house rules the landlord starred to feature. */
export function countFeaturedHouseRules(houseRules: HouseRuleMap): number {
  let n = 0;
  for (const meta of Object.values(houseRules ?? {})) {
    if (meta?.present && meta?.featured) n += 1;
  }
  return n;
}

/**
 * Tiles claimed automatically before the landlord's stars. Today that's the
 * off-campus drive-time-to-Nile tile, shown only when a figure is recorded.
 */
export function reservedFeaturedTiles(opts: {
  category: string;
  typeData?: Record<string, unknown> | null;
}): number {
  const nile = opts.typeData?.drive_min_nile;
  const hasDrive = typeof nile === 'number' && Number.isFinite(nile);
  return opts.category === 'off_campus' && hasDrive ? 1 : 0;
}

/**
 * How many items the landlord may still star — the shared budget across
 * amenities + house rules, net of any auto-reserved tiles.
 */
export function featuredBudget(opts: {
  category: string;
  typeData?: Record<string, unknown> | null;
}): number {
  return Math.max(0, MAX_FEATURED_TILES - reservedFeaturedTiles(opts));
}
