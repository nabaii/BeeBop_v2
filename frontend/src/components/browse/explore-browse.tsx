'use client';

/**
 * Explore — the single search surface for every listing lane.
 *
 * The URL is the source of truth for scope + filters, which is what makes a
 * filtered result set shareable, refresh-proof, and reachable with the back
 * button. History granularity is deliberate: scope and page changes `push`
 * (coarse, intentional moves you'd expect to undo), while filter tweaks
 * `replace` so a dozen checkbox toggles don't bury the page you came from.
 *
 * The four `/browse/<category>` routes redirect here with `?cat=` rather than
 * carrying their own filter UI — one code path, so the lanes can't drift.
 */

import { LayoutGrid, Map, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { BottomNav } from '@/components/bottom-nav';
import { ActiveFilters } from '@/components/browse/active-filters';
import { OffCampusFilterFields } from '@/components/browse/category/off-campus-filters';
import { RentFilterFields } from '@/components/browse/category/rent-filters';
import { SalesFilterFields } from '@/components/browse/category/sales-filters';
import { ShortLetFilterFields } from '@/components/browse/category/short-let-filters';
import { FilterPanel } from '@/components/browse/filter-panel';
import { MapView } from '@/components/browse/map-view';
import { ResultsGrid } from '@/components/browse/results-grid';
import { FeaturedCarousel } from '@/components/featured-carousel';
import { MainSidebar } from '@/components/main-sidebar';
import { ApiError } from '@/lib/api';
import {
  activeFilterCount,
  describeActiveFilters,
  DEFAULT_FILTERS,
  parseFilters,
  parseScope,
  removeFilter,
  retainForScope,
  toQuery,
  type ActiveFilter,
} from '@/lib/browse-url';
import { cn } from '@/lib/cn';
import {
  searchScope,
  type AnyFilters,
  type OffCampusFilters,
  type RentFilters,
  type SalesFilters,
  type SearchResponse,
  type SearchScope,
  type ShortLetFilters,
} from '@/lib/search';
import { useSearch } from '@/stores/search';

const SCOPE_TABS: { value: SearchScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'off_campus', label: 'Off-campus' },
  { value: 'short_let', label: 'Short-let' },
  { value: 'rent', label: 'Rent' },
  { value: 'sales', label: 'For sale' },
];

const EMPTY_HINTS: Record<SearchScope, string> = {
  all: 'Try removing a filter, or search a different district.',
  off_campus: 'Try widening the location or unit-type filters.',
  short_let: 'Try widening the date range or clearing the instant-booking filter.',
  rent: 'Try clearing bedroom or property-type filters.',
  sales: 'Try widening property type or title filters.',
};

/** Coalesces rapid filter toggles into one request. */
const FETCH_DEBOUNCE_MS = 250;
/** Longer, because it fires per keystroke. */
const QUERY_DEBOUNCE_MS = 350;

export function ExploreBrowse() {
  const router = useRouter();
  const params = useSearchParams();
  const queryString = params?.toString() ?? '';

  const { scope, filters } = useMemo(() => {
    const parsed = new URLSearchParams(queryString);
    const nextScope = parseScope(parsed);
    return { scope: nextScope, filters: parseFilters(parsed, nextScope) };
  }, [queryString]);

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [filterOpen, setFilterOpen] = useState(false);
  const [queryText, setQueryText] = useState(filters.q ?? '');
  const scrollRef = useRef<HTMLElement | null>(null);

  const chips = useMemo(() => describeActiveFilters(filters, scope), [filters, scope]);
  const filterCount = useMemo(() => activeFilterCount(filters, scope), [filters, scope]);
  const isPristine = scope === 'all' && chips.length === 0;

  function navigate(
    nextScope: SearchScope,
    nextFilters: AnyFilters,
    mode: 'push' | 'replace' = 'replace',
  ) {
    const href = `/browse${toQuery(nextScope, nextFilters)}` as Route;
    if (mode === 'push') router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }

  // A conversational search hands off its parsed filters through the search
  // store. Adopt them once, on a clean URL, then let the URL own the state —
  // otherwise a shared link would be overwritten by a stale chat session.
  // Selected field by field: a selector returning a fresh object would hand
  // useSyncExternalStore a new snapshot on every render.
  const seedCategory = useSearch((state) => state.category);
  const seedFilters = useSearch((state) => state.filters);
  const seedApplied = useRef(false);
  useEffect(() => {
    if (seedApplied.current) return;
    seedApplied.current = true;
    if (queryString !== '' || !seedCategory) return;
    navigate(seedCategory, { ...DEFAULT_FILTERS, ...seedFilters }, 'replace');
    // Runs once on mount; the seed and `navigate` are read at that moment only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External changes to `q` (a removed chip, the back button) win over the
  // in-progress input value.
  useEffect(() => {
    setQueryText(filters.q ?? '');
  }, [filters.q]);

  useEffect(() => {
    const trimmed = queryText.trim();
    if (trimmed === (filters.q ?? '')) return;
    const timer = setTimeout(() => {
      navigate(scope, { ...filters, q: trimmed || undefined, page: 1 });
    }, QUERY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryText, filters, scope]);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchScope(scope, filters)
        .then((res) => {
          if (live) setData(res);
        })
        .catch((err: unknown) => {
          if (!live) return;
          setError(err instanceof ApiError ? err.message : 'Search failed.');
          setData(null);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, FETCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [scope, filters]);

  function handleScopeChange(next: SearchScope) {
    if (next === scope) return;
    navigate(next, retainForScope(filters, next), 'push');
  }

  function handleFilterChange(next: AnyFilters) {
    navigate(scope, { ...next, page: 1 });
  }

  function handleRemoveChip(chip: ActiveFilter) {
    navigate(scope, removeFilter(filters, chip));
  }

  function handleClearAll() {
    navigate(scope, { ...DEFAULT_FILTERS });
  }

  function handlePageChange(page: number) {
    navigate(scope, { ...filters, page }, 'push');
    // The phone-shell <main> is the scroll container, not the window — paging
    // has to reset that element or page 2 opens halfway down the list.
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="flex min-h-[100dvh] bg-slate-100">
      <MainSidebar />
      <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col bg-paper shadow-xl">
        <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 pb-6 sm:p-6">
          <header className="mb-4 space-y-3">
            <div>
              <p className="text-caption font-semibold uppercase tracking-[0.22em] text-brand-700">
                Explore
              </p>
              <h1 className="font-display text-section font-semibold text-ink">
                Find your next place
              </h1>
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
                aria-hidden
              />
              <input
                type="search"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Search by area, title, or feature"
                aria-label="Search listings"
                className="min-h-11 w-full rounded-full border border-hairline bg-white pl-9 pr-3 text-body text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>

            <div
              className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
              role="tablist"
              aria-label="Listing category"
            >
              {SCOPE_TABS.map((tab) => {
                const active = tab.value === scope;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleScopeChange(tab.value)}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5 text-caption font-semibold transition-colors',
                      active
                        ? 'border-brand bg-brand text-ink'
                        : 'border-hairline bg-white text-ink-muted hover:bg-nectar',
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-hairline bg-white px-3 text-body font-medium text-ink hover:bg-nectar"
                aria-label={
                  filterCount > 0 ? `Open filters, ${filterCount} applied` : 'Open filters'
                }
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                Filters
                {filterCount > 0 && (
                  <span className="rounded-full bg-brand px-1.5 text-caption font-semibold text-ink">
                    {filterCount}
                  </span>
                )}
              </button>

              <div className="inline-grid grid-cols-2 overflow-hidden rounded-xl border border-hairline bg-white p-1 text-body">
                <button
                  type="button"
                  onClick={() => setView('grid')}
                  aria-pressed={view === 'grid'}
                  className={cn(
                    'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5',
                    view === 'grid' ? 'bg-brand text-ink' : 'text-ink-muted hover:bg-nectar',
                  )}
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden />
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setView('map')}
                  aria-pressed={view === 'map'}
                  className={cn(
                    'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5',
                    view === 'map' ? 'bg-brand text-ink' : 'text-ink-muted hover:bg-nectar',
                  )}
                >
                  <Map className="h-4 w-4" aria-hidden />
                  Map
                </button>
              </div>
            </div>
          </header>

          <ActiveFilters
            chips={chips}
            onRemove={handleRemoveChip}
            onClearAll={handleClearAll}
          />

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-body text-red-700">
              {error}
            </div>
          )}

          {/* Featured only earns its space before the seeker has told us
              anything — once a filter is on, results own the screen. */}
          {isPristine && (
            <section className="mb-6">
              <FeaturedCarousel showBrowseLink={false} />
            </section>
          )}

          {view === 'grid' ? (
            <ResultsGrid
              data={data}
              loading={loading}
              onPageChange={handlePageChange}
              emptyHint={EMPTY_HINTS[scope]}
            />
          ) : (
            <MapView data={data} onSelect={(l) => router.push(`/listings/${l.id}` as Route)} />
          )}
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
                  <h2 className="text-title font-semibold text-ink">Filters</h2>
                  <p className="text-caption text-ink-muted">
                    {SCOPE_TABS.find((t) => t.value === scope)?.label}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {filterCount > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="rounded-full px-3 py-1.5 text-caption font-semibold text-brand-700 hover:bg-nectar"
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-nectar"
                    aria-label="Close filters"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </div>

              <FilterPanel
                value={filters}
                scope={scope}
                onChange={handleFilterChange}
                className="rounded-none border-0 bg-transparent p-0"
              >
                {/* Passed conditionally: an element that renders null is still
                    truthy, which would leave an empty "More filters" heading. */}
                {scope !== 'all' && (
                  <ScopeFilterFields scope={scope} value={filters} onChange={handleFilterChange} />
                )}
              </FilterPanel>

              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="mt-5 flex min-h-11 w-full items-center justify-center rounded-xl bg-brand px-4 py-2 text-body font-semibold text-ink"
              >
                {loading
                  ? 'Searching...'
                  : `View ${data?.total.toLocaleString() ?? 0} result${data?.total === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}

        <BottomNav />
      </div>
    </div>
  );
}

/** The category-specific block for the active scope. "All" has none — those
 *  filters only exist inside a lane. */
function ScopeFilterFields({
  scope,
  value,
  onChange,
}: {
  scope: SearchScope;
  value: AnyFilters;
  onChange: (next: AnyFilters) => void;
}) {
  switch (scope) {
    case 'off_campus':
      return (
        <OffCampusFilterFields
          value={value as OffCampusFilters}
          onChange={(next) => onChange(next as AnyFilters)}
        />
      );
    case 'short_let':
      return (
        <ShortLetFilterFields
          value={value as ShortLetFilters}
          onChange={(next) => onChange(next as AnyFilters)}
        />
      );
    case 'rent':
      return (
        <RentFilterFields
          value={value as RentFilters}
          onChange={(next) => onChange(next as AnyFilters)}
        />
      );
    case 'sales':
      return (
        <SalesFilterFields
          value={value as SalesFilters}
          onChange={(next) => onChange(next as AnyFilters)}
        />
      );
    default:
      return null;
  }
}
