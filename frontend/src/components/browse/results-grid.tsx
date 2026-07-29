'use client';

/**
 * Paginated results grid shared across all four category browse pages.
 */

import { ListingCard } from '@/components/listing/listing-card';
import { ListingCardSkeleton } from '@/components/ui/skeleton';
import type { PublicListingSummary, SearchResponse } from '@/lib/search';

interface Props {
  data: SearchResponse | null;
  loading: boolean;
  onPageChange: (page: number) => void;
  emptyHint: string;
}

export function ResultsGrid({ data, loading, onPageChange, emptyHint }: Props) {
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
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center sm:p-12">
        <p className="text-sm text-slate-600">No listings match those filters yet.</p>
        <p className="mt-1 text-xs text-slate-500">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {data.total.toLocaleString()} result{data.total === 1 ? '' : 's'}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.results.map((r) => (
          <li key={r.id}>
            <ListingCard data={toCardData(r)} showSave />
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <nav className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={data.page <= 1 || loading}
            onClick={() => onPageChange(data.page - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">
            Page {data.page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={data.page >= totalPages || loading}
            onClick={() => onPageChange(data.page + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}
    </div>
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
    rating: r.rating,
    review_count: r.review_count,
    bedroom_count: r.bedroom_count,
    bathroom_count: r.bathroom_count,
    price_period: r.price_period,
    drive_min_nile: r.drive_min_nile,
  };
}
