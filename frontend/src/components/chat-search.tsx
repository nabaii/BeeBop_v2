'use client';

import type { Route } from 'next';
import { ArrowRight, Loader2, MoreHorizontal, Sparkles } from 'lucide-react';
import { startTransition, useEffect, useRef, useState } from 'react';
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
  '2-bedroom apartment in Wuse under N300k',
  'Gwarinpa short-let for next weekend',
  'Self-contain near UniAbuja',
  '3-bed for sale in Guzape',
];

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
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [entries.length, loading]);

  async function submit(nextQuery: string): Promise<void> {
    const query = nextQuery.trim();
    if (!query) return;

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

  const empty = entries.length === 0 && !loading;

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {empty ? (
          <EmptyState onPick={(q) => void submit(q)} />
        ) : (
          <ul className="space-y-5">
            {entries.map((entry) => (
              <li key={entry.response.query_id} className="space-y-3">
                <UserBubble text={entry.query} />
                <BotBubble text={entry.response.assistant_message} />
                {entry.response.results.length > 0 && (
                  <ResultsPanel
                    results={entry.response.results}
                    onOpenBrowse={() => openBrowse(entry.response)}
                    canOpenBrowse={Boolean(entry.response.parameters?.listing_category)}
                  />
                )}
                {entry.response.used_fallback && (
                  <p className="ml-12 text-[11px] font-medium text-amber-700">
                    Dev fallback mode
                  </p>
                )}
              </li>
            ))}
            {loading && <SearchingIndicator />}
          </ul>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(value);
        }}
        className="border-t border-slate-100 bg-white px-4 py-3"
      >
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={entries.length > 0 ? 'Ask follow up...' : 'Ask BeeBop...'}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={loading || !value.trim()}
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white px-4 py-4 shadow-sm">
        <p className="text-sm text-slate-700">
          Tell BeeBop what you&apos;re looking for — area, budget, bedrooms, or amenities.
        </p>
      </div>
      <ul className="space-y-2">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              onClick={() => onPick(suggestion)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:border-brand/40 hover:bg-brand-50"
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-slate-200 px-4 py-3 text-sm text-slate-900">
        {text}
      </div>
    </div>
  );
}

function BotBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white">
        <Sparkles className="h-4 w-4" aria-hidden />
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-slate-900 shadow-sm">
        {text}
      </div>
    </div>
  );
}

function SearchingIndicator() {
  return (
    <li className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </div>
      <span className="text-sm text-slate-500">BeeBop is searching...</span>
    </li>
  );
}

function ResultsPanel({
  results,
  onOpenBrowse,
  canOpenBrowse,
}: {
  results: ResultListingSummary[];
  onOpenBrowse: () => void;
  canOpenBrowse: boolean;
}) {
  return (
    <div className="ml-10 rounded-2xl bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {results.length} match{results.length === 1 ? '' : 'es'}
        </p>
        {canOpenBrowse && (
          <button
            type="button"
            onClick={onOpenBrowse}
            className="text-[11px] font-semibold text-brand-600 hover:text-brand-700"
          >
            See all
          </button>
        )}
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {results.map((result) => (
          <div key={result.id} className="w-[220px] shrink-0">
            <ListingCard data={toCardData(result)} />
          </div>
        ))}
      </div>
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

function pathForCategory(category: ListingCategory): Route {
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
