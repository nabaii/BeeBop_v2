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

import { useEffect, useMemo, useRef, useState } from 'react';

import { FilterPanel } from '@/components/browse/filter-panel';
import { MapView } from '@/components/browse/map-view';
import { ResultsGrid } from '@/components/browse/results-grid';
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = useMemo(() => JSON.stringify(filters), [filters]);

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
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={'px-3 py-1.5 ' + (view === 'grid' ? 'bg-brand text-white' : 'bg-white text-slate-700 hover:bg-slate-50')}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            className={'px-3 py-1.5 ' + (view === 'map' ? 'bg-brand text-white' : 'bg-white text-slate-700 hover:bg-slate-50')}
          >
            Map
          </button>
        </div>
      </header>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <FilterPanel value={filters} onChange={sharedOnChange}>
          {renderCategoryFilters(filters, (next) => setFilters({ ...next, page: 1 } as F))}
        </FilterPanel>
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
      </div>
    </main>
  );
}
