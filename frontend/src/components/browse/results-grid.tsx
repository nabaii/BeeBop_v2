'use client';

/**
 * Paginated results grid for the explore surface.
 *
 * Cards enter with a short staggered fade-up — capped, and `motion-safe` only,
 * so reduced-motion users get the static end state and a full page doesn't
 * turn into a slow wave.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { BeebopMark } from '@/components/brand/beebop-logo';
import { ListingCard } from '@/components/listing/listing-card';
import { ListingCardSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import type { PublicListingSummary, SearchResponse } from '@/lib/search';

interface Props {
  data: SearchResponse | null;
  loading: boolean;
  onPageChange: (page: number) => void;
  emptyHint: string;
  /** The empty state's escape hatch — only offered when filters are applied. */
  onClearFilters?: () => void;
  hasFilters?: boolean;
}

/** Past this many cards the stagger stops growing, so the last card on a full
 *  page doesn't wait most of a second to appear. */
const MAX_STAGGER = 8;
const STAGGER_STEP_MS = 40;

export function ResultsGrid({
  data,
  loading,
  onPageChange,
  emptyHint,
  onClearFilters,
  hasFilters = false,
}: Props) {
  if (loading && !data) {
    return (
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i}>
            <ListingCardSkeleton />
          </li>
        ))}
      </ul>
    );
  }
  if (!data) return null;

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  if (data.results.length === 0) {
    return (
      <div className="rounded-2xl border border-hairline bg-white px-6 py-10 text-center motion-safe:animate-fade-up">
        <BeebopMark size={32} className="mx-auto text-ink-soft" decorative />
        <p className="mt-3 font-display text-title font-semibold text-ink">Nothing matches yet</p>
        <p className="mx-auto mt-1.5 max-w-xs text-body text-ink-muted">{emptyHint}</p>
        {hasFilters && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-body font-semibold text-ink transition hover:bg-brand-600 active:scale-95 motion-safe:transition-transform"
          >
            Clear all filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-caption text-ink-muted">
          <span className="font-semibold tabular-nums text-ink">
            {data.total.toLocaleString()}
          </span>{' '}
          {data.total === 1 ? 'home' : 'homes'}
        </p>
        {totalPages > 1 && (
          <p className="text-caption tabular-nums text-ink-soft">
            Page {data.page} of {totalPages}
          </p>
        )}
      </div>

      <ul
        className={cn(
          'grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3',
          // Dim the outgoing set while the next loads rather than blanking the
          // screen — the layout holds and the change reads as a refresh.
          loading && 'opacity-60',
        )}
      >
        {data.results.map((r, i) => (
          <li
            key={r.id}
            className="motion-safe:animate-fade-up"
            style={{ animationDelay: `${Math.min(i, MAX_STAGGER) * STAGGER_STEP_MS}ms` }}
          >
            <ListingCard data={toCardData(r)} showSave />
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <nav
          className="flex items-center justify-between gap-2 pt-1"
          aria-label="Results pagination"
        >
          <PageButton
            direction="previous"
            disabled={data.page <= 1 || loading}
            onClick={() => onPageChange(data.page - 1)}
          />
          <span className="text-caption tabular-nums text-ink-muted">
            {data.page} / {totalPages}
          </span>
          <PageButton
            direction="next"
            disabled={data.page >= totalPages || loading}
            onClick={() => onPageChange(data.page + 1)}
          />
        </nav>
      )}
    </div>
  );
}

function PageButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'previous' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const previous = direction === 'previous';
  const Icon = previous ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${previous ? 'Previous' : 'Next'} page`}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hairline bg-white px-4 text-body font-medium text-ink transition-colors hover:bg-nectar disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
    >
      {previous && <Icon className="h-4 w-4" aria-hidden />}
      {previous ? 'Previous' : 'Next'}
      {!previous && <Icon className="h-4 w-4" aria-hidden />}
    </button>
  );
}

function toCardData(r: PublicListingSummary) {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    status: r.status,
    price: r.price,
    district: r.district,
    cover_photo: r.cover_url
      ? {
          id: `${r.id}-cover`,
          url: r.cover_url,
          room_label: null,
          is_cover: true,
          display_order: 0,
          unit_type_id: null,
        }
      : null,
    // Enables the card's hover crossfade to the second photo; the old mapping
    // dropped this, so browse cards silently lost the effect.
    secondary_url: r.secondary_url,
    rating: r.rating,
    review_count: r.review_count,
    bedroom_count: r.bedroom_count,
    bathroom_count: r.bathroom_count,
    price_period: r.price_period,
    drive_min_nile: r.drive_min_nile,
  };
}
