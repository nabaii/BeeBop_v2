/**
 * Typed client for the public search and listing-detail endpoints.
 */

import { api } from './api';
import type { ListingCategory, ListingStatus } from './listings';

export type VerificationTier = 'fully_verified' | 'doc_verified' | 'unverified';
export type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'highest_rated';

/** Explore can search one lane or every lane at once. "all" is a scope, not a
 *  category — each result still carries its own concrete category. */
export type SearchScope = ListingCategory | 'all';

export interface SharedFilters {
  q?: string;
  locations?: string[];
  verification?: VerificationTier[];
  amenities?: string[];         // "group:key"
  min_price?: number;
  max_price?: number;
  sort?: SortOption;
  page?: number;
  page_size?: number;
}

/** The campuses BeeBop records a drive time to on off-campus listings. */
export type Campus = 'nile' | 'baze';

export interface OffCampusFilters extends SharedFilters {
  use_profile_filters?: boolean;
  institution?: string;
  gender?: 'female' | 'male';
  unit_kinds?: string[];
  available_now?: boolean;
  campus?: Campus;
  max_drive_min?: number;
  /** Keep the places with no recorded drive time instead of dropping them. */
  include_unknown_drive?: boolean;
  /** House rules to avoid — exclusion only; every rule is a restriction. */
  exclude_house_rules?: string[];
}

export interface ShortLetFilters extends SharedFilters {
  check_in?: string;  // ISO date
  check_out?: string;
  min_stay?: number;
  instant_booking?: boolean;
  min_rating?: number;
  // No `guests`: nothing on a listing records guest capacity, so the control
  // it used to drive could never filter anything.
}

export interface RentFilters extends SharedFilters {
  bedroom_counts?: number[];
  min_bathrooms?: number;
  property_types?: string[];
  furnishing?: string[];
  payment_structure?: string[];
  available_from?: string;
}

export interface SalesFilters extends SharedFilters {
  bedroom_counts?: number[];
  min_bathrooms?: number;
  property_types?: string[];
  development_status?: string[];
  title_types?: string[];
}

/** Every filter any scope understands. Explore holds one of these and sends
 *  only the keys the active scope's endpoint accepts. */
export type AnyFilters = SharedFilters &
  Partial<OffCampusFilters & ShortLetFilters & RentFilters & SalesFilters>;

export interface LocationOption {
  district: string;
  count: number;
}

export interface PublicListingSummary {
  id: string;
  category: ListingCategory;
  status: ListingStatus;
  title: string;
  subtitle: string | null;
  price: number | null;
  district: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  cover_url: string | null;
  secondary_url?: string | null;
  /** Listing has at least one video tour, in any of its galleries. */
  has_video?: boolean;
  rating: number | null;
  review_count: number;
  price_period?: string | null;
  bedroom_count?: number | null;
  bathroom_count?: number | null;
  // Off-campus: manually-recorded driving time (minutes) to Nile University.
  drive_min_nile?: number | null;
  /**
   * Off-campus bed inventory. Null means "don't show" — the landlord opted out
   * via `show_availability`, or no rooms are recorded yet. Null is distinct
   * from 0, which means genuinely full.
   */
  beds_available?: number | null;
  beds_total?: number | null;
}

export interface SearchResponse {
  category: SearchScope;
  total: number;
  page: number;
  page_size: number;
  results: PublicListingSummary[];
  /**
   * Off-campus, drive-time cap active: how many listings were dropped only
   * because no drive time to that campus is recorded. 0 otherwise.
   */
  hidden_unknown_drive?: number;
}

export interface ValuationReport {
  area_scores: Record<string, unknown> | null;
  area_scores_last_updated: string | null;
  inspector_note: string | null;
  report_date: string | null;
}

export interface PublicAreaScore {
  scores: Record<string, unknown> | null;
  last_assessed_at: string | null;
}

export interface PublicRoom {
  id: string;
  name: string;
  beds_total: number;
  beds_available: number;
}

export interface PublicUnitTypePhoto {
  id: string;
  url: string;
  room_label: string | null;
  is_cover: boolean;
  display_order: number;
}

/** A gallery video tour. `poster_url` can be null — render without one. */
export interface PublicVideo {
  id: string;
  url: string;
  poster_url: string | null;
  duration_seconds: number | null;
  room_label: string | null;
  display_order: number;
}

export interface PublicUnitType {
  id: string;
  name: string;
  kind: string;
  price: number;
  price_period: string;
  beds_per_room: number;
  total_units: number;
  gender_tag: 'female' | 'male' | 'any';
  amenities: string[];
  beds_total: number;
  beds_available: number;
  rooms: PublicRoom[];
  // This unit type's own gallery. Empty when the landlord hasn't uploaded any —
  // list thumbnails fall back to the property cover, the unit page shows none.
  photos: PublicUnitTypePhoto[];
  /** This unit type's room tour — at most one. */
  videos?: PublicVideo[];
}

export interface PublicListingDetail {
  id: string;
  category: ListingCategory;
  status: ListingStatus;
  title: string;
  subtitle: string | null;
  description: string;
  district: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  price: number | null;
  price_period?: string | null;
  amenities: Record<
    string,
    Record<string, { present?: boolean; confirmed?: boolean; featured?: boolean }> | null
  >;
  type_data: Record<string, unknown>;
  photos: Array<{
    id: string;
    url: string;
    room_label: string | null;
    is_cover: boolean;
    display_order: number;
    is_inspector_walkthrough: boolean;
  }>;
  /** Property-gallery video tours, shown as their own group in the gallery. */
  videos?: PublicVideo[];
  area_score: PublicAreaScore | null;
  valuation_report: ValuationReport | null;
  is_bookmarked: boolean;
  rating: number | null;
  review_count: number;
  // Off-campus only: per-unit pricing + bed availability. Empty otherwise.
  unit_types: PublicUnitType[];
}

function toQueryString(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      continue;
    }
    if (typeof value === 'boolean') {
      params.append(key, value ? 'true' : 'false');
      continue;
    }
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const search = {
  all: (f: SharedFilters) =>
    api.get<SearchResponse>(`/search/all${toQueryString(f as Record<string, unknown>)}`, { auth: true }),
  offCampus: (f: OffCampusFilters) =>
    api.get<SearchResponse>(`/search/off-campus${toQueryString(f as Record<string, unknown>)}`, { auth: true }),
  shortLet: (f: ShortLetFilters) =>
    api.get<SearchResponse>(`/search/short-let${toQueryString(f as Record<string, unknown>)}`, { auth: true }),
  rent: (f: RentFilters) =>
    api.get<SearchResponse>(`/search/rent${toQueryString(f as Record<string, unknown>)}`, { auth: true }),
  sales: (f: SalesFilters) =>
    api.get<SearchResponse>(`/search/sales${toQueryString(f as Record<string, unknown>)}`, { auth: true }),
};

/** Runs the search for a scope, sending only the keys that scope accepts.
 *  Extra keys are dropped rather than passed through: FastAPI ignores unknown
 *  query params, but leaking `bedroom_counts` into a short-let URL would make
 *  shared links look like they filter something they don't. */
export function searchScope(scope: SearchScope, filters: AnyFilters): Promise<SearchResponse> {
  const shared = pick(filters, SHARED_KEYS);
  const scoped = (keys: readonly string[]) => ({ ...shared, ...pick(filters, keys) });
  switch (scope) {
    case 'off_campus':
      return search.offCampus(scoped(OFF_CAMPUS_KEYS) as OffCampusFilters);
    case 'short_let':
      return search.shortLet(scoped(SHORT_LET_KEYS) as ShortLetFilters);
    case 'rent':
      return search.rent(scoped(RENT_KEYS) as RentFilters);
    case 'sales':
      return search.sales(scoped(SALES_KEYS) as SalesFilters);
    default:
      // "All" has no price range — see the AllFilters docstring on the server.
      return search.all(omit(shared, ['min_price', 'max_price']) as SharedFilters);
  }
}

export const SHARED_KEYS = [
  'q',
  'locations',
  'verification',
  'amenities',
  'min_price',
  'max_price',
  'sort',
  'page',
  'page_size',
] as const;

export const OFF_CAMPUS_KEYS = [
  'use_profile_filters',
  'institution',
  'gender',
  'unit_kinds',
  'available_now',
  'campus',
  'max_drive_min',
  'include_unknown_drive',
  'exclude_house_rules',
] as const;

export const SHORT_LET_KEYS = [
  'check_in',
  'check_out',
  'min_stay',
  'instant_booking',
  'min_rating',
] as const;

export const RENT_KEYS = [
  'bedroom_counts',
  'min_bathrooms',
  'property_types',
  'furnishing',
  'payment_structure',
  'available_from',
] as const;

export const SALES_KEYS = [
  'bedroom_counts',
  'min_bathrooms',
  'property_types',
  'development_status',
  'title_types',
] as const;

/** The category-specific keys each scope understands, for URL round-tripping
 *  and for clearing filters that stop applying when the scope changes. */
export const SCOPE_KEYS: Record<SearchScope, readonly string[]> = {
  all: [],
  off_campus: OFF_CAMPUS_KEYS,
  short_let: SHORT_LET_KEYS,
  rent: RENT_KEYS,
  sales: SALES_KEYS,
};

function pick<T extends object>(source: T, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function omit(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out = { ...source };
  for (const key of keys) delete out[key];
  return out;
}

export function getSearchLocations(scope: SearchScope = 'all'): Promise<LocationOption[]> {
  return api.get(`/search/locations?category=${encodeURIComponent(scope)}`);
}

export interface PriceRangeBounds {
  min: number | null;
  max: number | null;
}

/** Real price bounds for a lane, so the slider spans actual inventory. */
export function getPriceRange(scope: SearchScope): Promise<PriceRangeBounds> {
  return api.get(`/search/price-range?category=${encodeURIComponent(scope)}`);
}

export function getPublicListing(id: string): Promise<PublicListingDetail> {
  return api.get(`/public/listings/${id}`, { auth: true });
}

export function getFeaturedListings(limit = 6): Promise<PublicListingSummary[]> {
  return api.get(`/public/featured?limit=${limit}`);
}
