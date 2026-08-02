/**
 * Search state — active filters + conversational session context reference.
 *
 * Filters are the shared set (location, verification status, amenities, sort)
 * plus category-specific extras. Sprint 3 lands the full filter schema;
 * Sprint 13 adds the conversational session-id link so a chat query can seed
 * the explore page's filters.
 *
 * This store is a handoff channel, not the live filter state: explore adopts a
 * seed once, on a clean URL, and the URL owns it from there (see
 * `components/browse/explore-browse.tsx`).
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
  /**
   * A query handed to the homepage chat to run on arrival — set when the user
   * taps one of their recent queries on the profile. Deliberately in-memory:
   * it survives client-side navigation but not a reload, so refreshing the
   * homepage never silently re-fires someone's old search.
   */
  pendingQuery: string | null;
  setSessionContext: (args: {
    category: ListingCategory | null;
    filters: SearchSeedFilters;
    sessionId: string | null;
  }) => void;
  setPendingQuery: (query: string | null) => void;
  clearSession: () => void;
}

const defaultFilters: SearchSeedFilters = {
  verification: ['fully_verified', 'doc_verified', 'unverified'],
  sort: 'relevance',
  page: 1,
  page_size: 24,
};

export const useSearch = create<SearchState>((set) => ({
  category: null,
  filters: defaultFilters,
  sessionId: null,
  pendingQuery: null,
  setSessionContext: ({ category, filters, sessionId }) =>
    set({
      category,
      filters: {
        ...defaultFilters,
        ...filters,
      },
      sessionId,
    }),
  setPendingQuery: (pendingQuery) => set({ pendingQuery }),
  clearSession: () =>
    set({
      category: null,
      sessionId: null,
      filters: defaultFilters,
      // A fresh chat must not inherit a queued replay from the previous one.
      pendingQuery: null,
    }),
}));
