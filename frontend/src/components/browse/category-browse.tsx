'use client';

/**
 * Category-agnostic browse shell. Each of the four browse pages supplies:
 *   • The category name
 *   • Its filter state and default values
 *   • The search function to call
 *   • A React element for the category-specific filter block
 *
 * The shell handles: layout, grid vs map toggle, pagination, debounced
 * requests on filter change, and an empty-state hint.
 */

import { LayoutGrid, Map, Menu, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { BottomNav } from '@/components/bottom-nav';
import { FilterPanel } from '@/components/browse/filter-panel';
import { MapView } from '@/components/browse/map-view';
import { ResultsGrid } from '@/components/browse/results-grid';
import { MainSidebar } from '@/components/main-sidebar';
import { ApiError } from '@/lib/api';
import type { PublicListingSummary, SearchResponse, SharedFilters } from '@/lib/search';

export interface CategoryBrowseProps<F extends SharedFilters> {
  title: string;
  emptyHint: string;
  initialFilters: F;
  search: (filters: F) => Promise<SearchResponse>;
  renderCategoryFilters: (value: F, onChange: (next: F) => void) => React.ReactNode;
  onPinSelect?: (listing: PublicListingSummary) => void;
}

const FILTER_DEBOUNCE_MS = 300;

export function CategoryBrowse<F extends SharedFilters>({
  title,
  emptyHint,
  initialFilters,
  search,
  renderCategoryFilters,
  onPinSelect,
}: CategoryBrowseProps<F>) {
  const [filters, setFilters] = useState<F>(initialFilters);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialFiltersKey = useMemo(() => JSON.stringify(initialFilters), [initialFilters]);
  const initialFiltersKeyRef = useRef(initialFiltersKey);
  const key = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    if (initialFiltersKeyRef.current === initialFiltersKey) {
      return;
    }

    initialFiltersKeyRef.current = initialFiltersKey;
    setFilters(initialFilters);
    setData(null);
    setLoading(true);
  }, [initialFilters, initialFiltersKey]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await search(filters);
        setData(res);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Search failed.');
      } finally {
        setLoading(false);
      }
    }, FILTER_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, search]);

  function sharedOnChange(next: SharedFilters) {
    setFilters((prev) => ({ ...prev, ...next, page: 1 } as F));
  }

  return (
    <div className="flex min-h-[100dvh] bg-slate-100">
      <MainSidebar
        mobileOpen={drawerOpen}
        onMobileClose={() => setDrawerOpen(false)}
      />
      <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col bg-slate-50 shadow-xl">
        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-6 sm:p-6">
          <header className="mb-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </button>
                <h1 className="min-w-0 truncate text-xl font-semibold text-slate-900 sm:text-2xl">
                  {title}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                aria-label="Open filters"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                Filters
              </button>
            </div>
            <div className="inline-grid w-full grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm sm:w-auto sm:inline-flex sm:p-0">
              <button
                type="button"
                onClick={() => setView('grid')}
                className={
                  'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 sm:rounded-none sm:py-1.5 ' +
                  (view === 'grid' ? 'bg-brand text-slate-900' : 'text-slate-700 hover:bg-slate-50')
                }
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
                Grid
              </button>
              <button
                type="button"
                onClick={() => setView('map')}
                className={
                  'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 sm:rounded-none sm:py-1.5 ' +
                  (view === 'map' ? 'bg-brand text-slate-900' : 'text-slate-700 hover:bg-slate-50')
                }
              >
                <Map className="h-4 w-4" aria-hidden />
                Map
              </button>
            </div>
          </header>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            {view === 'grid' ? (
              <ResultsGrid
                data={data}
                loading={loading}
                onPageChange={(page) => setFilters((prev) => ({ ...prev, page } as F))}
                emptyHint={emptyHint}
              />
            ) : (
              <MapView data={data} onSelect={(l) => onPinSelect?.(l)} />
            )}
          </div>
        </main>
        {filterOpen && (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close filters"
              onClick={() => setFilterOpen(false)}
              className="absolute inset-0 bg-slate-950/45"
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-[0_-18px_42px_rgba(15,23,42,0.2)] safe-pb">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Filters</h2>
                  <p className="text-xs text-slate-500">{title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                  aria-label="Close filters"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <FilterPanel
                value={filters}
                onChange={sharedOnChange}
                className="rounded-none border-0 bg-transparent p-0"
              >
                {renderCategoryFilters(filters, (next) => setFilters({ ...next, page: 1 } as F))}
              </FilterPanel>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="mt-5 flex min-h-11 w-full items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-slate-900"
              >
                View results
              </button>
            </div>
          </div>
        )}
        <BottomNav />
      </div>
    </div>
  );
}
