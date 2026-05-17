'use client';

import type { Route } from 'next';
import {
  ArrowRight,
  Banknote,
  BadgeCheck,
  Bath,
  BedDouble,
  Briefcase,
  Car,
  ChevronRight,
  Clock,
  Home,
  Loader2,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Search,
  SlidersHorizontal,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { startTransition, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { BookmarkButton } from '@/components/browse/bookmark-button';
import { FeaturedCarousel } from '@/components/featured-carousel';
import { ListingCard } from '@/components/listing/listing-card';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
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
  const [expandedQueryId, setExpandedQueryId] = useState<string | null>(null);
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
    setExpandedQueryId(null);

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
      <div className="h-full overflow-y-auto px-4 py-5 min-[380px]:py-6">
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-slate-900 min-[380px]:text-2xl">
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

          <ul className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
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

  const latestEntry = entries[entries.length - 1];
  const latestResultEntry = latestEntry?.response.results.length ? latestEntry : undefined;
  const expandedEntry = expandedQueryId
    ? entries.find((entry) => entry.response.query_id === expandedQueryId)
    : undefined;

  if (expandedEntry?.response.results.length) {
    return (
      <ExpandedResultsView
        entry={expandedEntry}
        value={value}
        onValueChange={setValue}
        loading={loading}
        error={error}
        onSubmit={submit}
        onOpenBrowse={() => openBrowse(expandedEntry.response)}
        canOpenBrowse={Boolean(expandedEntry.response.parameters?.listing_category)}
      />
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-slate-50">
      <div
        ref={scrollRef}
        className={cn(
          'flex-1 overflow-y-auto px-4 py-4',
          latestResultEntry ? 'pb-[250px]' : '',
        )}
      >
        <ul className="space-y-5">
          {entries.map((entry) => (
            <li key={entry.response.query_id} className="space-y-3">
              <UserBubble text={entry.query} />
              <BotBubble text={entry.response.assistant_message} />
              {entry.response.results.length > 0 &&
                entry.response.query_id !== latestResultEntry?.response.query_id && (
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

      {latestResultEntry ? (
        <CollapsedResultsWindow
          entry={latestResultEntry}
          value={value}
          onValueChange={setValue}
          loading={loading}
          onSubmit={submit}
          onExpand={() => setExpandedQueryId(latestResultEntry.response.query_id)}
        />
      ) : (
        <div className="border-t border-slate-100 bg-white px-4 py-3">
          <RefineSearchForm
            value={value}
            onValueChange={setValue}
            loading={loading}
            onSubmit={submit}
            placeholder="Ask follow up..."
          />
        </div>
      )}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[86%] rounded-2xl rounded-tr-sm bg-slate-200 px-4 py-3 text-sm text-slate-900">
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
      <div className="max-w-[86%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-slate-900 shadow-sm">
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
    <div className="rounded-2xl bg-white p-3 shadow-sm min-[380px]:ml-10">
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

function CollapsedResultsWindow({
  entry,
  value,
  onValueChange,
  loading,
  onSubmit,
  onExpand,
}: {
  entry: ChatEntry;
  value: string;
  onValueChange: (next: string) => void;
  loading: boolean;
  onSubmit: (query: string) => Promise<void>;
  onExpand: () => void;
}) {
  const pointerStart = useRef<number | null>(null);

  return (
    <section className="absolute inset-x-0 bottom-0 rounded-t-[32px] bg-white px-4 pb-4 pt-3 shadow-[0_-18px_44px_rgba(15,23,42,0.12)] min-[380px]:px-6">
      <button
        type="button"
        onClick={onExpand}
        onPointerDown={(event) => {
          pointerStart.current = event.clientY;
        }}
        onPointerUp={(event) => {
          if (pointerStart.current !== null && pointerStart.current - event.clientY > 24) {
            onExpand();
          }
          pointerStart.current = null;
        }}
        className="mb-3 flex w-full flex-col items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600"
        aria-label="Expand results"
      >
        <span className="h-1.5 w-12 rounded-full bg-slate-200" aria-hidden />
        <span>Swipe up to expand results</span>
      </button>

      <div className="-mx-2 flex snap-x snap-mandatory gap-5 overflow-x-auto px-2 pb-4">
        {entry.response.results.map((result) => (
          <MiniResultCard key={result.id} result={result} />
        ))}
      </div>

      <RefineSearchForm
        value={value}
        onValueChange={onValueChange}
        loading={loading}
        onSubmit={onSubmit}
        placeholder="Ask follow up..."
      />
    </section>
  );
}

function ExpandedResultsView({
  entry,
  value,
  onValueChange,
  loading,
  error,
  onSubmit,
  onOpenBrowse,
  canOpenBrowse,
}: {
  entry: ChatEntry;
  value: string;
  onValueChange: (next: string) => void;
  loading: boolean;
  error: string | null;
  onSubmit: (query: string) => Promise<void>;
  onOpenBrowse: () => void;
  canOpenBrowse: boolean;
}) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="shrink-0 bg-[linear-gradient(180deg,#e5e2dc_0%,#f8fafc_100%)] px-0 pb-7 pt-9">
        <SearchQueryPill
          query={entry.query}
          onOpenBrowse={onOpenBrowse}
          canOpenBrowse={canOpenBrowse}
        />
      </div>

      <div className="flex-1 overflow-y-auto bg-white pt-12">
        <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-6 min-[380px]:px-[34px]">
          {entry.response.results.map((result) => (
            <div key={result.id} className="w-[calc(100vw-48px)] max-w-[320px] shrink-0 snap-center">
              <ExpandedListingCard
                result={result}
                parameters={entry.response.parameters}
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="mx-6 mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="shrink-0 bg-white px-4 pb-4 pt-2 min-[380px]:px-6">
        <RefineSearchForm
          value={value}
          onValueChange={onValueChange}
          loading={loading}
          onSubmit={onSubmit}
          placeholder="Refine search... e.g. 'Must have a pool'"
        />
      </div>
    </div>
  );
}

function SearchQueryPill({
  query,
  onOpenBrowse,
  canOpenBrowse,
}: {
  query: string;
  onOpenBrowse: () => void;
  canOpenBrowse: boolean;
}) {
  return (
    <div className="rounded-t-[28px] border border-white bg-slate-50 px-4 py-5 shadow-[0_-1px_0_rgba(255,255,255,0.9)]">
      <div className="flex items-center gap-3">
        <Search className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
        <p className="min-w-0 flex-1 text-sm leading-5 text-stone-700">{query}</p>
        <button
          type="button"
          onClick={onOpenBrowse}
          disabled={!canOpenBrowse}
          aria-label="Open browse filters"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-700 transition hover:bg-slate-200 disabled:opacity-40"
        >
          <SlidersHorizontal className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function RefineSearchForm({
  value,
  onValueChange,
  loading,
  onSubmit,
  placeholder,
}: {
  value: string;
  onValueChange: (next: string) => void;
  loading: boolean;
  onSubmit: (query: string) => Promise<void>;
  placeholder: string;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(value);
      }}
    >
      <div className="flex min-h-[58px] items-center gap-3 rounded-full bg-[#dfe2e3] px-4 py-2 shadow-[0_10px_28px_rgba(15,23,42,0.12)]">
        <button
          type="button"
          aria-label="Attach preference"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-600 transition hover:bg-white/50"
        >
          <Paperclip className="h-5 w-5" aria-hidden />
        </button>
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm leading-5 text-stone-700 outline-none placeholder:text-stone-600/80"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d1a200] text-white shadow-[0_8px_20px_rgba(161,123,0,0.32)] transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ArrowRight className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>
    </form>
  );
}

function MiniResultCard({
  result,
}: {
  result: ResultListingSummary;
}) {
  return (
    <Link
      href={`/listings/${result.id}` as Route}
      className="flex w-[min(258px,76vw)] shrink-0 snap-center overflow-hidden rounded-[22px] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.12)] ring-1 ring-slate-100"
    >
      <div className="relative h-[92px] w-[92px] shrink-0 bg-slate-100">
        <img
          src={coverUrl(result)}
          alt={result.title}
          className="h-full w-full object-cover"
        />
        <VerificationBadge status={result.status} compact />
      </div>
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <p className="text-lg font-bold leading-none text-slate-900">
          {formatPrice(result.price)}
          <span className="ml-0.5 text-xs font-medium text-stone-600">
            {priceUnit(result.category)}
          </span>
        </p>
        <h3 className="mt-2 line-clamp-2 text-sm leading-4 text-stone-700">
          {cleanTitle(result.title)}
        </h3>
        <LocationPill district={result.district} className="mt-2" />
      </div>
    </Link>
  );
}

function ExpandedListingCard({
  result,
  parameters,
}: {
  result: ResultListingSummary;
  parameters: ExtractedParameters | null;
}) {
  const specs = propertySpecs(result, parameters);

  return (
    <article className="overflow-hidden rounded-[14px] bg-white shadow-[0_14px_38px_rgba(15,23,42,0.12)] ring-1 ring-slate-100">
      <div className="relative aspect-[16/11] bg-slate-100">
        <img
          src={coverUrl(result)}
          alt={result.title}
          className="h-full w-full object-cover"
        />
        <VerificationBadge status={result.status} />
        <BookmarkButton
          listingId={result.id}
          icon="heart"
          className="absolute right-4 top-4 h-9 w-9 bg-white text-slate-800"
        />
      </div>

      <div className="px-5 pb-5 pt-5">
        <LocationPill district={result.district} />
        <h2 className="mt-4 line-clamp-2 text-xl font-bold leading-6 text-slate-950">
          {cleanTitle(result.title)}
        </h2>
        <div className="mt-3 flex items-center gap-3 text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1">
            <BedDouble className="h-4 w-4" aria-hidden />
            {specs.bedrooms}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bath className="h-4 w-4" aria-hidden />
            {specs.bathrooms}
          </span>
          <span className="inline-flex items-center gap-1">
            <Car className="h-4 w-4" aria-hidden />
            {specs.parking}
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
          <div>
            <p className="text-xs text-stone-500">{priceLabel(result.category)}</p>
            <p className="mt-1 text-2xl font-bold leading-none text-slate-950">
              {formatPrice(result.price)}
            </p>
          </div>
          <Link
            href={`/listings/${result.id}` as Route}
            aria-label={`Open ${result.title}`}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-slate-950 transition hover:bg-brand-600"
          >
            <ChevronRight className="h-6 w-6" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}

function VerificationBadge({
  status,
  compact = false,
}: {
  status: string;
  compact?: boolean;
}) {
  const tier = normaliseStatus(status);
  const fullyVerified = ['fully_verified', 'let_agreed', 'sale_agreed'].includes(tier);
  const docVerified = tier === 'doc_verified';
  const label = fullyVerified
    ? 'AGIS Verified'
    : docVerified
      ? 'Doc Verified'
      : 'Unverified';

  return (
    <span
      className={cn(
        'absolute left-4 top-4 inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide text-white shadow-sm',
        compact ? 'left-2 top-2 px-1.5 py-0.5 text-[8px]' : 'px-3 py-1.5 text-[11px]',
        fullyVerified && 'bg-[#d5ad3c]',
        docVerified && 'bg-verification-doc',
        !fullyVerified && !docVerified && 'bg-verification-unverified',
      )}
    >
      <BadgeCheck className={compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} aria-hidden />
      {label}
    </span>
  );
}

function LocationPill({
  district,
  className,
}: {
  district: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-orange-700',
        className,
      )}
    >
      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{district ?? 'Abuja'}</span>
    </span>
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

const FALLBACK_COVER_URL =
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=900&q=80';

function coverUrl(result: ResultListingSummary): string {
  return result.cover_url ?? FALLBACK_COVER_URL;
}

function cleanTitle(title: string): string {
  return title.replace(/^\[seed\]\s*/i, '');
}

function formatPrice(value: number | null): string {
  if (value == null) return 'Price on request';
  return `\u20a6${value.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

function priceUnit(category: ListingCategory): string {
  switch (category) {
    case 'rent':
      return '/yr';
    case 'short_let':
      return '/night';
    case 'off_campus':
      return '/term';
    case 'sales':
    default:
      return '';
  }
}

function priceLabel(category: ListingCategory): string {
  switch (category) {
    case 'rent':
      return 'Annual Rent';
    case 'short_let':
      return 'Nightly Rate';
    case 'off_campus':
      return 'Term Price';
    case 'sales':
    default:
      return 'Asking Price';
  }
}

function propertySpecs(
  result: ResultListingSummary,
  parameters: ExtractedParameters | null,
): { bedrooms: string; bathrooms: string; parking: string } {
  const bedroomCount = parameters?.bedroom_count ?? extractBedroomCount(result.title);
  const bedrooms = bedroomCount ?? 4;
  const bathrooms = bedrooms >= 4 ? '4.5' : String(Math.max(1, bedrooms));
  const parking = bedrooms >= 3 ? '2' : '1';
  return {
    bedrooms: String(bedrooms),
    bathrooms,
    parking,
  };
}

function extractBedroomCount(title: string): number | null {
  const match = title.match(/\b(\d+)\s*[- ]?bed(?:room)?/i);
  return match ? Number(match[1]) : null;
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
