/**
 * Explore filter state <-> URL query string.
 *
 * The URL is the single source of truth for what the explore page is showing.
 * That is what makes a filtered result set shareable, survivable across a
 * refresh, and navigable with the back button — none of which worked while the
 * filters lived only in component state.
 *
 * Defaults are never written to the URL, so an untouched explore page has a
 * clean `/browse` address and "is anything filtered?" is just "are there any
 * params?".
 */

import {
  SCOPE_KEYS,
  type AnyFilters,
  type SearchScope,
  type SortOption,
  type VerificationTier,
} from './search';

export const SCOPES: readonly SearchScope[] = [
  'all',
  'off_campus',
  'short_let',
  'rent',
  'sales',
] as const;

export const ALL_TIERS: readonly VerificationTier[] = [
  'fully_verified',
  'doc_verified',
  'unverified',
] as const;

const SORTS: readonly SortOption[] = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'highest_rated',
] as const;

export const DEFAULT_PAGE_SIZE = 24;

export const DEFAULT_FILTERS: AnyFilters = {
  verification: [...ALL_TIERS],
  sort: 'relevance',
  page: 1,
  page_size: DEFAULT_PAGE_SIZE,
};

/** Keys held as repeated params (`?unit_kinds=a&unit_kinds=b`). */
const LIST_KEYS = new Set([
  'locations',
  'verification',
  'amenities',
  'unit_kinds',
  'property_types',
  'furnishing',
  'payment_structure',
  'development_status',
  'title_types',
  'exclude_house_rules',
]);

const NUMBER_LIST_KEYS = new Set(['bedroom_counts']);

const NUMBER_KEYS = new Set([
  'min_price',
  'max_price',
  'min_stay',
  'min_rating',
  'min_bathrooms',
  'max_drive_min',
  'page',
  'page_size',
]);

const BOOLEAN_KEYS = new Set(['available_now', 'instant_booking', 'use_profile_filters']);

/** Every category-specific key across all scopes. */
const ALL_SCOPED_KEYS: readonly string[] = Array.from(
  new Set(SCOPES.flatMap((scope) => [...SCOPE_KEYS[scope]])),
);

function isScope(value: string | null): value is SearchScope {
  return value !== null && (SCOPES as readonly string[]).includes(value);
}

export function parseScope(params: URLSearchParams): SearchScope {
  const raw = params.get('cat');
  return isScope(raw) ? raw : 'all';
}

/** Read filter state out of the URL. Unknown params are ignored. */
export function parseFilters(params: URLSearchParams, scope: SearchScope): AnyFilters {
  const filters: AnyFilters = { ...DEFAULT_FILTERS };
  const readable = [
    'q',
    'locations',
    'verification',
    'amenities',
    'min_price',
    'max_price',
    'sort',
    'page',
    ...SCOPE_KEYS[scope],
  ];

  for (const key of readable) {
    const values = params.getAll(key).filter((v) => v !== '');
    if (values.length === 0) continue;
    const target = filters as Record<string, unknown>;

    if (NUMBER_LIST_KEYS.has(key)) {
      const nums = values.map(Number).filter((n) => Number.isFinite(n));
      if (nums.length) target[key] = nums;
      continue;
    }
    if (LIST_KEYS.has(key)) {
      target[key] = values;
      continue;
    }
    if (NUMBER_KEYS.has(key)) {
      const num = Number(values[0]);
      if (Number.isFinite(num)) target[key] = num;
      continue;
    }
    if (BOOLEAN_KEYS.has(key)) {
      target[key] = values[0] === 'true';
      continue;
    }
    if (key === 'sort') {
      if ((SORTS as readonly string[]).includes(values[0])) target.sort = values[0];
      continue;
    }
    target[key] = values[0];
  }

  // A verification list that selected nothing would match nothing; treat it as
  // "not set" rather than trapping the user on an empty result set.
  const tiers = filters.verification ?? [];
  const valid = tiers.filter((t) => (ALL_TIERS as readonly string[]).includes(t));
  filters.verification = valid.length ? valid : [...ALL_TIERS];

  return filters;
}

/**
 * Serialise scope + filters back to a query string, omitting anything left at
 * its default so an untouched page has a clean URL.
 */
export function toQuery(scope: SearchScope, filters: AnyFilters): string {
  const params = new URLSearchParams();
  if (scope !== 'all') params.set('cat', scope);

  const writable = [
    'q',
    'locations',
    'verification',
    'amenities',
    ...(scope === 'all' ? [] : ['min_price', 'max_price']),
    'sort',
    'page',
    ...SCOPE_KEYS[scope],
  ];

  for (const key of writable) {
    const value = (filters as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === '') continue;

    if (key === 'verification') {
      const tiers = value as VerificationTier[];
      // All three selected is the default — leave it out of the URL.
      if (tiers.length === ALL_TIERS.length) continue;
      for (const tier of tiers) params.append(key, tier);
      continue;
    }
    if (key === 'sort' && value === 'relevance') continue;
    if (key === 'page' && value === 1) continue;

    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      continue;
    }
    if (typeof value === 'boolean') {
      if (!value) continue;
      params.append(key, 'true');
      continue;
    }
    params.append(key, String(value));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Drop category-specific filters that the new scope doesn't understand.
 *
 * Without this, switching Rent -> Short-let would keep `bedroom_counts` in
 * state: invisible in the panel, absent from the results, and back the moment
 * you switched to Sales. Shared filters deliberately survive the switch —
 * a location and a budget still mean the same thing in the next lane.
 */
export function retainForScope(filters: AnyFilters, scope: SearchScope): AnyFilters {
  const keep = new Set<string>(SCOPE_KEYS[scope]);
  const next = { ...filters } as Record<string, unknown>;
  for (const key of ALL_SCOPED_KEYS) {
    if (!keep.has(key)) delete next[key];
  }
  if (scope === 'all') {
    // No price range spans nightly, annual, and outright prices.
    delete next.min_price;
    delete next.max_price;
  }
  if (scope === 'all' && (next.sort === 'price_asc' || next.sort === 'price_desc')) {
    next.sort = 'relevance';
  }
  next.page = 1;
  return next as AnyFilters;
}

/** How many filters the user has actively applied — drives the count badge. */
export function activeFilterCount(filters: AnyFilters, scope: SearchScope): number {
  return describeActiveFilters(filters, scope).length;
}

export interface ActiveFilter {
  /** Filter key this chip belongs to. */
  key: string;
  /** Set for list-valued filters — the single entry this chip removes. */
  item?: string | number;
  label: string;
}

const SCOPED_LABELS: Record<string, string> = {
  unit_kinds: 'Unit',
  available_now: 'Available now',
  check_in: 'From',
  check_out: 'Until',
  min_stay: 'Min stay',
  instant_booking: 'Instant booking',
  min_rating: 'Rating',
  bedroom_counts: 'Beds',
  min_bathrooms: 'Baths',
  property_types: 'Type',
  furnishing: 'Furnishing',
  payment_structure: 'Payment',
  available_from: 'From',
  development_status: 'Status',
  title_types: 'Title',
  institution: 'School',
  gender: 'Gender',
  campus: 'Campus',
  max_drive_min: 'Drive',
};

/** Chips whose default label would read wrong without help. */
const CAMPUS_LABELS: Record<string, string> = { nile: 'Nile University', baze: 'Baze University' };

function humanise(value: string | number): string {
  return String(value).replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * The applied filters, as individually removable chips.
 *
 * This is what lets someone staring at "No listings match" see why without
 * reopening the sheet — and undo one constraint at a time instead of all of
 * them.
 */
export function describeActiveFilters(filters: AnyFilters, scope: SearchScope): ActiveFilter[] {
  const chips: ActiveFilter[] = [];

  if (filters.q) chips.push({ key: 'q', label: `"${filters.q}"` });

  for (const token of filters.locations ?? []) {
    chips.push({ key: 'locations', item: token, label: token });
  }

  const tiers = filters.verification ?? [];
  if (tiers.length > 0 && tiers.length < ALL_TIERS.length) {
    for (const tier of tiers) {
      chips.push({ key: 'verification', item: tier, label: humanise(tier) });
    }
  }

  for (const token of filters.amenities ?? []) {
    chips.push({ key: 'amenities', item: token, label: humanise(token.split(':')[1] ?? token) });
  }

  if (scope !== 'all') {
    if (filters.min_price !== undefined) {
      chips.push({ key: 'min_price', label: `Min ₦${filters.min_price.toLocaleString()}` });
    }
    if (filters.max_price !== undefined) {
      chips.push({ key: 'max_price', label: `Max ₦${filters.max_price.toLocaleString()}` });
    }
  }

  for (const key of SCOPE_KEYS[scope]) {
    const value = (filters as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === '') continue;

    // Campus and drive time are one filter to a seeker ("within 20 min of
    // Nile"), so they read as one chip and clear together. `campus` alone
    // filters nothing, so it never gets a chip of its own.
    if (key === 'campus') continue;
    if (key === 'max_drive_min') {
      const campus = filters.campus ? CAMPUS_LABELS[filters.campus] ?? filters.campus : 'campus';
      chips.push({ key, label: `Within ${value} min of ${campus}` });
      continue;
    }
    if (key === 'exclude_house_rules') {
      for (const rule of value as string[]) {
        chips.push({ key, item: rule, label: `No ${String(rule).replaceAll('_', ' ')}` });
      }
      continue;
    }
    if (key === 'min_bathrooms') {
      chips.push({ key, label: `${value}+ baths` });
      continue;
    }

    const name = SCOPED_LABELS[key] ?? humanise(key);
    if (Array.isArray(value)) {
      for (const item of value as (string | number)[]) {
        chips.push({ key, item, label: `${name}: ${humanise(item)}` });
      }
      continue;
    }
    if (typeof value === 'boolean') {
      if (value) chips.push({ key, label: name });
      continue;
    }
    chips.push({ key, label: `${name}: ${humanise(value as string | number)}` });
  }

  return chips;
}

/** Remove one chip's contribution, leaving every other filter intact. */
export function removeFilter(filters: AnyFilters, chip: ActiveFilter): AnyFilters {
  const next = { ...filters } as Record<string, unknown>;

  if (chip.key === 'verification') {
    const remaining = (filters.verification ?? []).filter((t) => t !== chip.item);
    // Removing the last selected tier means "no tier preference", not "match
    // nothing" — the server treats an empty list as the latter.
    next.verification = remaining.length ? remaining : [...ALL_TIERS];
  } else if (chip.key === 'max_drive_min') {
    // One chip, one filter: drop the campus with the cap, or `campus` would
    // linger in the URL doing nothing.
    delete next.max_drive_min;
    delete next.campus;
  } else if (chip.item !== undefined) {
    const current = (next[chip.key] as (string | number)[] | undefined) ?? [];
    const remaining = current.filter((item) => item !== chip.item);
    if (remaining.length) next[chip.key] = remaining;
    else delete next[chip.key];
  } else {
    delete next[chip.key];
  }

  next.page = 1;
  return next as AnyFilters;
}
