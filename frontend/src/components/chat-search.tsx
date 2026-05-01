'use client';

import { ArrowRight, Loader2, Minimize2, Search, Sparkles } from 'lucide-react';
import { startTransition, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ListingCard } from '@/components/listing/listing-card';
import { ApiError } from '@/lib/api';
import {
  sendChatQuery,
  type ChatResponse,
  type ExtractedParameters,
  type ResultListingSummary,
} from '@/lib/ai-search';
import type { ListingCategory, PhotoView } from '@/lib/listings';
import type { SearchSeedFilters } from '@/stores/search';
import { useSearch } from '@/stores/search';

const SUGGESTIONS = [
  'a 2-bed in Wuse 2 under 4m',
  'Gwarinpa short-let for next weekend',
  'Self-contain near UniAbuja',
  '3-bed for sale in Guzape',
];

type WindowState = 'collapsed' | 'expanded' | 'minimized';

interface ChatEntry {
  query: string;
  response: ChatResponse;
}

export function ChatSearchPanel() {
  const router = useRouter();
  const setSessionContext = useSearch((state) => state.setSessionContext);
  const [value, setValue] = useState('');
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [windowState, setWindowState] = useState<WindowState>('collapsed');

  const latest = entries[entries.length - 1] ?? null;
  const latestLabel = useMemo(() => {
    if (latest == null) return 'Latest reply';
    if (latest.response.results.length > 0) {
      return `${latest.response.results.length} matches ready`;
    }
    return 'Latest reply';
  }, [latest]);

  async function submit(nextQuery: string): Promise<void> {
    const query = nextQuery.trim();
    if (!query) return;

    setWindowState('expanded');
    setLoading(true);
    setError(null);
    setValue('');

    try {
      const response = await sendChatQuery({ query, session_id: sessionId });
      setEntries((current) => [...current, { query, response }]);
      setSessionId(response.session_id);

      const previous = useSearch.getState();
      setSessionContext({
        sessionId: response.session_id,
        category: response.parameters?.listing_category ?? previous.category,
        filters: response.parameters
          ? buildBrowseSeed(response.parameters)
          : previous.filters,
      });
    } catch (err) {
      setValue(query);
      setError(err instanceof ApiError ? err.message : 'Chat search failed.');
    } finally {
      setLoading(false);
    }
  }

  function openBrowse(response: ChatResponse): void {
    const category = response.parameters?.listing_category;
    if (!category) return;

    setSessionContext({
      sessionId: response.session_id,
      category,
      filters: response.parameters
        ? buildBrowseSeed(response.parameters)
        : useSearch.getState().filters,
    });
    startTransition(() => {
      router.push(pathForCategory(category));
    });
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div className="rounded-[28px] border border-slate-200 bg-white/95 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(value);
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <div className="flex flex-1 items-center gap-3 rounded-[22px] bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" aria-hidden />
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Ask BeeBop - e.g. a 2-bed in Wuse 2 under 4m"
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            <span>{loading ? 'Searching' : 'Ask BeeBop'}</span>
          </button>
        </form>
        <ul className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => {
                  setValue(suggestion);
                  void submit(suggestion);
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-brand/30 hover:bg-brand-50 hover:text-brand"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {windowState === 'minimized' && latest && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Result Window
            </p>
            <p className="text-sm text-slate-700">{latestLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {latest.response.parameters?.listing_category && (
              <button
                type="button"
                onClick={() => openBrowse(latest.response)}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Open browse
              </button>
            )}
            <button
              type="button"
              onClick={() => setWindowState('expanded')}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              Expand
            </button>
          </div>
        </div>
      )}

      {windowState === 'expanded' && (
        <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Result Window
              </p>
              <p className="text-sm text-slate-600">
                Conversational results stay active for this session only.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWindowState('minimized')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
              <span>Minimize</span>
            </button>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            {entries.length === 0 && !loading && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">
                  Ask BeeBop in plain English.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Try area, budget, bedroom count, or amenities like generator and borehole.
                </p>
              </div>
            )}

            {entries.map((entry) => (
              <article
                key={entry.response.query_id}
                className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50/70"
              >
                <div className="border-b border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    You asked
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{entry.query}</p>
                </div>
                <div className="space-y-4 px-4 py-4">
                  <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white">
                    {entry.response.assistant_message}
                  </div>

                  {entry.response.parameters?.listing_category && (
                    <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                      <MetaChip label={labelForCategory(entry.response.parameters.listing_category)} />
                      {entry.response.parameters.locations.map((location) => (
                        <MetaChip key={location} label={location} />
                      ))}
                      {entry.response.parameters.max_price != null && (
                        <MetaChip
                          label={`Under N${entry.response.parameters.max_price.toLocaleString('en-NG', {
                            maximumFractionDigits: 0,
                          })}`}
                        />
                      )}
                      {entry.response.parameters.bedroom_count != null && (
                        <MetaChip label={`${entry.response.parameters.bedroom_count} bed`} />
                      )}
                    </div>
                  )}

                  {entry.response.results.length > 0 && (
                    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {entry.response.results.map((result) => (
                        <li key={result.id}>
                          <ListingCard data={toCardData(result)} />
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {entry.response.parameters?.listing_category && (
                      <button
                        type="button"
                        onClick={() => openBrowse(entry.response)}
                        className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        <span>Open full results</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                    {entry.response.used_fallback && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700">
                        Dev fallback mode
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}

            {loading && (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>BeeBop is searching the current session context.</span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function buildBrowseSeed(parameters: ExtractedParameters): SearchSeedFilters {
  return {
    q: parameters.raw_query,
    locations: parameters.locations,
    verification: parameters.verification_tiers,
    amenities: parameters.amenities,
    min_price: parameters.min_price ?? undefined,
    max_price: parameters.max_price ?? undefined,
    sort: 'relevance',
    page: 1,
    page_size: 24,
    bedroom_counts:
      parameters.bedroom_count != null ? [parameters.bedroom_count] : undefined,
  };
}

function pathForCategory(category: ListingCategory): string {
  switch (category) {
    case 'off_campus':
      return '/browse/off-campus';
    case 'short_let':
      return '/browse/short-let';
    case 'sales':
      return '/browse/sales';
    case 'rent':
    default:
      return '/browse/rent';
  }
}

function labelForCategory(category: ListingCategory): string {
  switch (category) {
    case 'off_campus':
      return 'Off-campus';
    case 'short_let':
      return 'Short-let';
    case 'sales':
      return 'For sale';
    case 'rent':
    default:
      return 'Rent';
  }
}

function MetaChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
      {label}
    </span>
  );
}

function toCardData(result: ResultListingSummary) {
  const coverPhoto: PhotoView | null = result.cover_url
    ? {
        id: `${result.id}-cover`,
        url: result.cover_url,
        room_label: null,
        is_cover: true,
        display_order: 0,
      }
    : null;

  return {
    id: result.id,
    title: result.title,
    category: result.category,
    status: normaliseStatus(result.status),
    price: result.price,
    district: result.district,
    cover_photo: coverPhoto,
    rating: result.rating,
    review_count: result.review_count,
    href: `/listings/${result.id}`,
  };
}

function normaliseStatus(status: string) {
  return status as
    | 'draft'
    | 'under_doc_review'
    | 'live_unverified'
    | 'doc_verified'
    | 'fully_verified'
    | 'let_agreed'
    | 'sale_agreed'
    | 'suspended'
    | 'delisted';
}
