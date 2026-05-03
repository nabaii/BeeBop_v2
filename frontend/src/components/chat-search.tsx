'use client';

import type { Route } from 'next';
import {
  ArrowRight,
  Banknote,
  Briefcase,
  Clock,
  Home,
  Loader2,
  MoreHorizontal,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { startTransition, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { FeaturedCarousel } from '@/components/featured-carousel';
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

const SUGGESTIONS: { text: string; icon: LucideIcon }[] = [
  { text: 'Hostels near Baze', icon: Home },
  { text: 'Short-let in Jahi', icon: Clock },
  { text: '1-bedroom under N500k', icon: Banknote },
  { text: 'Houses for sale in Maitama', icon: Tag },
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

  if (empty) {
    return (
      <div className="h-full overflow-y-auto px-4 py-6">
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900">
              What kind of place are you looking for?
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              I&apos;ll find verified options in Abuja for you.
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit(value);
            }}
          >
            <div className="flex items-center gap-3 rounded-3xl bg-white p-2 shadow-md">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                <Briefcase className="h-5 w-5" aria-hidden />
              </div>
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="2-bedroom in Wuse under N300k"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={loading || !value.trim()}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </form>

          <ul className="grid grid-cols-2 gap-2">
            {SUGGESTIONS.map(({ text, icon: Icon }) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => void submit(text)}
                  className="flex h-full w-full items-start gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs text-slate-700 transition hover:border-brand/40 hover:bg-brand-50"
                >
                  <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                  <span>{text}</span>
                </button>
              </li>
            ))}
          </ul>

          <FeaturedCarousel />

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
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
            placeholder="Ask follow up..."
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
        <Briefcase className="h-4 w-4" aria-hidden />
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
