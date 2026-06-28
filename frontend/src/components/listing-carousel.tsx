'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ListingCard, type ListingCardData } from '@/components/listing/listing-card';
import { ListingCardSkeleton } from '@/components/ui/skeleton';
import type { PublicListingSummary } from '@/lib/search';

export interface ListingCarouselProps {
  title: string;
  // Resolves the row's listings. Returning [] (or throwing) hides the whole
  // row — callers never have to special-case empty datasets. MUST be a stable
  // reference (module-level or memoised); it drives the load effect.
  fetcher: () => Promise<PublicListingSummary[]>;
  seeAllHref?: Route;
}

export function ListingCarousel({ title, fetcher, seeAllHref }: ListingCarouselProps) {
  const [items, setItems] = useState<PublicListingSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((l) => !cancelled && setItems(l))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  if (items === null) {
    return (
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <div className="flex gap-4 overflow-x-auto pb-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-64 shrink-0">
              <ListingCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }
  // A row with no matches stays invisible rather than rendering an empty shell.
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-sm font-medium text-brand hover:text-brand-700"
          >
            See all &rsaquo;
          </Link>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((r) => (
          <div key={r.id} className="w-64 shrink-0">
            <ListingCard showSave data={toCardData(r)} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function toCardData(r: PublicListingSummary): ListingCardData {
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
        }
      : null,
    secondary_url: r.secondary_url,
    rating: r.rating,
    review_count: r.review_count,
    bedroom_count: r.bedroom_count,
    bathroom_count: r.bathroom_count,
    price_period: r.price_period,
  };
}
