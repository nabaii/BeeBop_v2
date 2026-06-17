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
  Paperclip,
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

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-paper">
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
            <ListingCard data={toCardData(result)} showSave />
          </div>
        ))}
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
    title: cleanTitle(result.title),
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

function cleanTitle(title: string): string {
  return title.replace(/^\[seed\]\s*/i, '');
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
