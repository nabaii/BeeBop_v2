'use client';

import type { Route } from 'next';
import {
  ArrowRight,
  Banknote,
  BadgeCheck,
  Bath,
  BedDouble,
  Briefcase,
  ChevronRight,
  Clock,
  Home,
  ImageOff,
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
import { pricePeriodLabel } from '@/lib/listings';
import type { ListingCategory, PhotoView } from '@/lib/listings';
import { useCyclingPlaceholder, useStreamedText } from '@/lib/use-motion';
import type { SearchSeedFilters } from '@/stores/search';
import { useSearch } from '@/stores/search';

const SUGGESTIONS: { text: string; icon: LucideIcon }[] = [
  { text: 'Hostels near Baze', icon: Home },
  { text: 'Short-let in Jahi', icon: Clock },
  { text: '1-bedroom under N500k', icon: Banknote },
  { text: 'Houses for sale in Maitama', icon: Tag },
];

// Rotated through the input placeholder so the bar keeps suggesting ideas —
// on the hero and in the ongoing conversation, not just at the start.
const PLACEHOLDER_EXAMPLES = [
  '2-bedroom in Wuse under N300k',
  'Hostels near Baze',
  'Short-let in Jahi',
  '1-bedroom under N500k',
  'Houses for sale in Maitama',
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
  const heroPlaceholder = useCyclingPlaceholder(PLACEHOLDER_EXAMPLES, {
    paused: value.trim().length > 0,
  });

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
            <h2 className="font-display text-section font-bold text-ink motion-safe:animate-fade-up-hero min-[380px]:text-hero">
              What kind of place are you looking for?
            </h2>
            <p
              className="mt-2 text-body text-ink-muted motion-safe:animate-fade-up"
              style={{ animationDelay: '200ms' }}
            >
              I&apos;ll find verified options in Abuja for you.
            </p>
          </div>

          <form
            className="motion-safe:animate-fade-up"
            style={{ animationDelay: '280ms' }}
            onSubmit={(event) => {
              event.preventDefault();
              void submit(value);
            }}
          >
            {/* The confident bar: tall, hairline at rest, Honey ring + warm glow on focus. */}
            <div className="flex h-14 items-center gap-2 rounded-full border border-hairline bg-white pl-2 pr-2 transition-shadow focus-within:border-brand focus-within:shadow-[0_4px_24px_rgba(240,152,15,0.25)] focus-within:ring-2 focus-within:ring-brand">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-ink">
                <Briefcase className="h-5 w-5" aria-hidden />
              </div>
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={heroPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
              />
              <button
                type="submit"
                disabled={loading || !value.trim()}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-ink transition hover:bg-brand-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-transform"
              >
                <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </form>

          <div className="motion-safe:animate-fade-up" style={{ animationDelay: '360ms' }}>
            <FeaturedCarousel />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-muted">
              Need ideas? Try asking for one of these:
            </p>
            <ul className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              {SUGGESTIONS.map(({ text, icon: Icon }, index) => (
                <li key={text}>
                  <button
                    type="button"
                    onClick={() => void submit(text)}
                    // Stagger left-to-right at 40ms intervals, after the hero settles.
                    style={{ animationDelay: `${440 + index * 40}ms` }}
                    className="flex h-full w-full items-start gap-2 rounded-2xl border border-hairline bg-white px-3 py-2.5 text-left text-xs text-ink transition hover:border-brand/40 hover:bg-nectar motion-safe:animate-fade-up"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                    <span>{text}</span>
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
    <div className="relative flex h-full flex-col overflow-hidden bg-paper">
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
              {entry.response.used_fallback && process.env.NODE_ENV === 'development' && (
                <p className="ml-12 text-caption font-medium text-amber-700">
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
        <div className="border-t border-hairline bg-white px-4 py-3">
          <RefineSearchForm
            value={value}
            onValueChange={setValue}
            loading={loading}
            onSubmit={submit}
            placeholder="Ask follow up..."
            cyclePlaceholders={PLACEHOLDER_EXAMPLES}
          />
        </div>
      )}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end motion-safe:animate-fade-up">
      {/* The branded move: Nectar (pale honey) with Hive Black text, no shadow. */}
      <div className="max-w-[86%] rounded-2xl rounded-tr-sm bg-nectar px-4 py-3 text-body text-ink">
        {text}
      </div>
    </div>
  );
}

function BotBubble({ text }: { text: string }) {
  // Reveal word-by-word on first mount so the assistant reads as if it's
  // composing the reply. Older bubbles have already finished; reduced motion
  // shows the full text immediately.
  const streamed = useStreamedText(text);
  return (
    <div className="flex items-start gap-2 motion-safe:animate-fade-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-ink">
        <Briefcase className="h-4 w-4" aria-hidden />
      </div>
      {/* Warm white with a hairline border instead of a floating drop shadow. */}
      <div className="max-w-[86%] rounded-2xl rounded-tl-sm border border-hairline bg-white px-4 py-3 text-body text-ink">
        {streamed}
      </div>
    </div>
  );
}

function SearchingIndicator() {
  return (
    <li className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nectar text-ink-muted">
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </div>
      <span className="text-body text-ink-muted">Beebop is searching...</span>
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
    <div className="rounded-2xl border border-hairline bg-white p-3 min-[380px]:ml-10">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-caption font-semibold uppercase tracking-[0.18em] text-ink-soft">
          {results.length} match{results.length === 1 ? '' : 'es'}
        </p>
        {canOpenBrowse && (
          <button
            type="button"
            onClick={onOpenBrowse}
            className="text-caption font-semibold text-brand-600 hover:text-brand-700"
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
    <section className="absolute inset-x-0 bottom-0 rounded-t-[32px] border-t border-hairline bg-white px-4 pb-4 pt-3 shadow-[0_-12px_32px_rgba(35,26,15,0.08)] min-[380px]:px-6">
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
        className="mb-3 flex w-full flex-col items-center gap-2 text-caption font-bold uppercase tracking-[0.14em] text-ink-muted"
        aria-label="Expand results"
      >
        <span className="h-1.5 w-12 rounded-full bg-hairline" aria-hidden />
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
      <div className="shrink-0 bg-[linear-gradient(180deg,#F3ECDD_0%,#FCFAF6_100%)] px-0 pb-7 pt-9">
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
    <div className="rounded-t-[28px] border border-hairline bg-white px-4 py-5">
      <div className="flex items-center gap-3">
        <Search className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
        <p className="min-w-0 flex-1 text-sm leading-5 text-ink">{query}</p>
        <button
          type="button"
          onClick={onOpenBrowse}
          disabled={!canOpenBrowse}
          aria-label="Open browse filters"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-nectar disabled:opacity-40"
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
  cyclePlaceholders,
}: {
  value: string;
  onValueChange: (next: string) => void;
  loading: boolean;
  onSubmit: (query: string) => Promise<void>;
  placeholder: string;
  // When supplied (and >1), the placeholder rotates through these examples
  // instead of showing the static `placeholder`. Holds steady while typing.
  cyclePlaceholders?: string[];
}) {
  const dynamicPlaceholder = useCyclingPlaceholder(cyclePlaceholders ?? [placeholder], {
    paused: value.trim().length > 0,
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(value);
      }}
    >
      {/* 56px confident bar: hairline at rest, Honey ring + warm glow on focus. */}
      <div className="flex h-14 items-center gap-2 rounded-full border border-hairline bg-white px-3 transition-shadow focus-within:border-brand focus-within:shadow-[0_4px_24px_rgba(240,152,15,0.25)] focus-within:ring-2 focus-within:ring-brand">
        <button
          type="button"
          aria-label="Attach preference"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-nectar"
        >
          <Paperclip className="h-5 w-5" aria-hidden />
        </button>
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={dynamicPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-sm leading-5 text-ink outline-none placeholder:text-ink-soft"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-ink transition hover:bg-brand-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-transform"
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
      className="flex w-[min(258px,76vw)] shrink-0 snap-center overflow-hidden rounded-[22px] border border-hairline bg-white"
    >
      <div className="relative h-[92px] w-[92px] shrink-0 bg-hairline">
        <CoverImage result={result} />
        <VerificationBadge status={result.status} compact />
      </div>
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <p className="text-lg font-bold leading-none text-ink">
          {formatPrice(result.price)}
          <span className="ml-0.5 text-xs font-medium text-ink-muted">
            {priceUnit(result)}
          </span>
        </p>
        <h3 className="mt-2 line-clamp-2 text-sm leading-4 text-ink">
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
  const bedrooms =
    result.bedroom_count ?? parameters?.bedroom_count ?? extractBedroomCount(result.title);
  const bathrooms = result.bathroom_count ?? null;

  return (
    <article className="overflow-hidden rounded-[14px] border border-hairline bg-white">
      <div className="relative aspect-[16/11] bg-hairline">
        <CoverImage result={result} />
        <VerificationBadge status={result.status} />
        <BookmarkButton
          listingId={result.id}
          icon="heart"
          className="absolute right-4 top-4 h-9 w-9 bg-white text-ink"
        />
      </div>

      <div className="px-5 pb-5 pt-5">
        <LocationPill district={result.district} />
        <h2 className="mt-4 line-clamp-2 text-xl font-bold leading-6 text-ink">
          {cleanTitle(result.title)}
        </h2>
        {(bedrooms != null || bathrooms != null) && (
          <div className="mt-3 flex items-center gap-3 text-xs font-medium text-ink-muted">
            {bedrooms != null && (
              <span className="inline-flex items-center gap-1">
                <BedDouble className="h-4 w-4" aria-hidden />
                {bedrooms} bed{bedrooms === 1 ? '' : 's'}
              </span>
            )}
            {bathrooms != null && (
              <span className="inline-flex items-center gap-1">
                <Bath className="h-4 w-4" aria-hidden />
                {bathrooms} bath{bathrooms === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex items-end justify-between border-t border-hairline pt-4">
          <div>
            <p className="text-xs text-ink-muted">{priceLabel(result.category)}</p>
            <p className="mt-1 text-2xl font-bold leading-none text-ink">
              {formatPrice(result.price)}
            </p>
          </div>
          <Link
            href={`/listings/${result.id}` as Route}
            aria-label={`Open ${result.title}`}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-ink transition hover:bg-brand-600"
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
        // `compact` is an overlay pin on a small map/thumbnail — intentionally
        // below the 13px reading floor (spatial constraint, not body text).
        compact ? 'left-2 top-2 px-1.5 py-0.5 text-[8px]' : 'px-3 py-1.5 text-caption',
        fullyVerified && 'bg-verification-fully',
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
        'inline-flex max-w-full items-center gap-1 rounded-md bg-nectar px-3 py-1 text-xs font-medium text-brand-700',
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
    secondary_url: result.secondary_url,
    rating: result.rating,
    review_count: result.review_count,
    bedroom_count: result.bedroom_count,
    bathroom_count: result.bathroom_count,
    price_period: result.price_period,
    href: `/listings/${result.id}`,
  };
}

/**
 * Renders the real cover photo when present, or an unmistakably generic
 * placeholder when the listing has none — we never substitute stock imagery
 * that could read as a photo of this specific unit.
 */
function CoverImage({ result }: { result: ResultListingSummary }) {
  if (!result.cover_url) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-hairline text-ink-soft">
        <ImageOff className="h-6 w-6" aria-hidden />
        <span className="text-caption font-medium">No photo yet</span>
      </div>
    );
  }
  return (
    <img
      src={result.cover_url}
      alt={cleanTitle(result.title)}
      className="h-full w-full object-cover"
    />
  );
}

function cleanTitle(title: string): string {
  return title.replace(/^\[seed\]\s*/i, '');
}

function formatPrice(value: number | null): string {
  if (value == null) return 'Price on request';
  return `\u20a6${value.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

function priceUnit(result: ResultListingSummary): string {
  switch (result.category) {
    case 'rent':
      return '/yr';
    case 'short_let':
      return '/night';
    case 'off_campus':
      return result.price_period ? `/${pricePeriodLabel(result.price_period)}` : '/term';
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
      return 'Starting rate';
    case 'sales':
    default:
      return 'Asking Price';
  }
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
