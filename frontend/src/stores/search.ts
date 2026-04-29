/**
 * Search state — active filters + conversational session context reference.
 *
 * Filters are the shared set (location, verification status, amenities, sort)
 * plus category-specific extras. Sprint 3 lands the full filter schema;
 * Sprint 13 adds the conversational session-id link so a chat query can seed
 * category-browse filters.
 */
import { create } from 'zustand';

export type ListingCategory = 'off_campus' | 'short_let' | 'rent' | 'sales';

export type VerificationTier = 'fully_verified' | 'doc_verified' | 'unverified';

export interface SharedFilters {
  locations: string[];
  verificationTiers: VerificationTier[];
  amenities: string[];
  sort: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'highest_rated';
}

interface SearchState {
  category: ListingCategory | null;
  filters: SharedFilters;
  sessionId: string | null;
  setCategory: (c: ListingCategory | null) => void;
  setFilters: (updater: (f: SharedFilters) => SharedFilters) => void;
  clearSession: () => void;
}

const defaultFilters: SharedFilters = {
  locations: [],
  // Default checks pre-selected to nudge seekers toward verified listings —
  // matches dev plan §7.3 (Category browse pages story).
  verificationTiers: ['fully_verified', 'doc_verified'],
  amenities: [],
  sort: 'relevance',
};

export const useSearch = create<SearchState>((set) => ({
  category: null,
  filters: defaultFilters,
  sessionId: null,
  setCategory: (category) => set({ category }),
  setFilters: (updater) => set((s) => ({ filters: updater(s.filters) })),
  clearSession: () => set({ sessionId: null, filters: defaultFilters }),
}));
