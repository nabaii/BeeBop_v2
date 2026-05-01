/**
 * Search state — active filters + conversational session context reference.
 *
 * Filters are the shared set (location, verification status, amenities, sort)
 * plus category-specific extras. Sprint 3 lands the full filter schema;
 * Sprint 13 adds the conversational session-id link so a chat query can seed
 * category-browse filters.
 */
import { create } from 'zustand';

import type {
  OffCampusFilters,
  RentFilters,
  SalesFilters,
  ShortLetFilters,
} from '@/lib/search';

export type ListingCategory = 'off_campus' | 'short_let' | 'rent' | 'sales';

export type SearchSeedFilters = Partial<
  OffCampusFilters & ShortLetFilters & RentFilters & SalesFilters
>;

interface SearchState {
  category: ListingCategory | null;
  filters: SearchSeedFilters;
  sessionId: string | null;
  setSessionContext: (args: {
    category: ListingCategory | null;
    filters: SearchSeedFilters;
    sessionId: string | null;
  }) => void;
  clearSession: () => void;
}

const defaultFilters: SearchSeedFilters = {
  verification: ['fully_verified', 'doc_verified'],
  sort: 'relevance',
  page: 1,
  page_size: 24,
};

export const useSearch = create<SearchState>((set) => ({
  category: null,
  filters: defaultFilters,
  sessionId: null,
  setSessionContext: ({ category, filters, sessionId }) =>
    set({
      category,
      filters: {
        ...defaultFilters,
        ...filters,
      },
      sessionId,
    }),
  clearSession: () => set({ category: null, sessionId: null, filters: defaultFilters }),
}));
