/**
 * Typed client for the public search and listing-detail endpoints.
 */

import { api } from './api';
import type { ListingCategory, ListingStatus } from './listings';

export type VerificationTier = 'fully_verified' | 'doc_verified' | 'unverified';
export type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'highest_rated';

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

export interface OffCampusFilters extends SharedFilters {
  use_profile_filters?: boolean;
  institution?: string;
  gender?: 'female' | 'male';
  unit_kinds?: string[];
  available_now?: boolean;
}

export interface ShortLetFilters extends SharedFilters {
  check_in?: string;  // ISO date
  check_out?: string;
  guests?: number;
  min_stay?: number;
  instant_booking?: boolean;
  min_rating?: number;
}

export interface RentFilters extends SharedFilters {
  bedroom_counts?: number[];
  property_types?: string[];
  furnishing?: string[];
  payment_structure?: string[];
  available_from?: string;
}

export interface SalesFilters extends SharedFilters {
  bedroom_counts?: number[];
  property_types?: string[];
  development_status?: string[];
  title_types?: string[];
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
  rating: number | null;
  review_count: number;
}

export interface SearchResponse {
  category: ListingCategory;
  total: number;
  page: number;
  page_size: number;
  results: PublicListingSummary[];
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

export interface PublicUnitType {
  id: string;
  name: string;
  kind: string;
  price: number;
  beds_per_room: number;
  total_units: number;
  beds_total: number;
  beds_available: number;
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
  amenities: Record<string, Record<string, { present?: boolean; confirmed?: boolean }> | null>;
  type_data: Record<string, unknown>;
  photos: Array<{
    id: string;
    url: string;
    room_label: string | null;
    is_cover: boolean;
    display_order: number;
    is_inspector_walkthrough: boolean;
  }>;
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
  offCampus: (f: OffCampusFilters) =>
    api.get<SearchResponse>(`/search/off-campus${toQueryString(f as Record<string, unknown>)}`, { auth: true }),
  shortLet: (f: ShortLetFilters) =>
    api.get<SearchResponse>(`/search/short-let${toQueryString(f as Record<string, unknown>)}`, { auth: true }),
  rent: (f: RentFilters) =>
    api.get<SearchResponse>(`/search/rent${toQueryString(f as Record<string, unknown>)}`, { auth: true }),
  sales: (f: SalesFilters) =>
    api.get<SearchResponse>(`/search/sales${toQueryString(f as Record<string, unknown>)}`, { auth: true }),
};

export function getPublicListing(id: string): Promise<PublicListingDetail> {
  return api.get(`/public/listings/${id}`, { auth: true });
}

export function getFeaturedListings(limit = 6): Promise<PublicListingSummary[]> {
  return api.get(`/public/featured?limit=${limit}`);
}
