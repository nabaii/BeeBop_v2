/**
 * Listing card — used on browse grids, search results, and the landlord
 * dashboard. Variants by category per dev plan §7.2:
 *   • Sales cards hide the rating row (one-time transactions).
 *   • Price unit changes per category (annual / per term / nightly / total).
 *   • Unverified state is visually distinct from verified tiers.
 */

import { Bath, BedDouble } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

import { cn } from '@/lib/cn';
import type { ListingCategory, ListingStatus, PhotoView } from '@/lib/listings';

export interface ListingCardData {
  id: string;
  title: string | null;
  category: ListingCategory;
  status: ListingStatus;
  price: number | null;
  district: string | null;
  cover_photo?: PhotoView | null;
  rating?: number | null;        // short-let / rent / student
  review_count?: number | null;
  bedroom_count?: number | null; // real specs from type_data; null = omit
  bathroom_count?: number | null;
  href?: string;                 // defaults to /listings/[id]
}

export function ListingCard({ data }: { data: ListingCardData }) {
  const href = data.href ?? `/listings/${data.id}`;
  const tier = verificationTier(data.status);

  return (
    <Link
      href={href as Route}
      className="group block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[4/3] bg-slate-100">
        {data.cover_photo?.url ? (
          <img
            src={data.cover_photo.url}
            alt={data.title ?? 'Listing'}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            No photo
          </div>
        )}
        <div className="absolute left-2 top-2">
          <VerificationBadge tier={tier} />
        </div>
        {tier === 'unverified' && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/60 to-transparent px-3 py-2 text-xs text-white">
            Awaiting verification
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex flex-col gap-2 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {data.title ?? 'Untitled listing'}
            </div>
            {data.district && (
              <div className="text-xs text-slate-500">{data.district}</div>
            )}
          </div>
          <div className="shrink-0 text-left min-[380px]:text-right">
            <div className="text-sm font-semibold text-slate-900">
              {formatPrice(data.price)}
            </div>
            <div className="text-[11px] text-slate-500">{priceUnit(data.category)}</div>
          </div>
        </div>
        {(data.bedroom_count != null || data.bathroom_count != null) && (
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
            {data.bedroom_count != null && (
              <span className="inline-flex items-center gap-1">
                <BedDouble className="h-3.5 w-3.5" aria-hidden />
                {data.bedroom_count} bed{data.bedroom_count === 1 ? '' : 's'}
              </span>
            )}
            {data.bathroom_count != null && (
              <span className="inline-flex items-center gap-1">
                <Bath className="h-3.5 w-3.5" aria-hidden />
                {data.bathroom_count} bath{data.bathroom_count === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}
        {data.category !== 'sales' && typeof data.rating === 'number' && (
          <div className="mt-2 flex items-center gap-1 text-xs text-slate-600">
            <Star />
            <span className="font-medium text-slate-800">{data.rating.toFixed(1)}</span>
            {typeof data.review_count === 'number' && (
              <span className="text-slate-500">({data.review_count})</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export type VerificationTier = 'fully_verified' | 'doc_verified' | 'unverified';

function verificationTier(status: ListingStatus): VerificationTier {
  if (status === 'fully_verified' || status === 'let_agreed' || status === 'sale_agreed') {
    return 'fully_verified';
  }
  if (status === 'doc_verified') return 'doc_verified';
  return 'unverified';
}

function VerificationBadge({ tier }: { tier: VerificationTier }) {
  const label =
    tier === 'fully_verified'
      ? 'AGIS Verified'
      : tier === 'doc_verified'
        ? 'Doc Verified'
        : 'Unverified';
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium',
        tier === 'fully_verified' && 'bg-verification-fully text-white',
        tier === 'doc_verified' && 'bg-verification-doc text-white',
        tier === 'unverified' && 'bg-verification-unverified text-white',
      )}
    >
      {label}
    </span>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-amber-400" aria-hidden="true">
      <path d="M10 1.5l2.7 5.5 6 .9-4.4 4.3 1 6-5.3-2.8L4.7 18.2l1-6L1.3 7.9l6-.9L10 1.5z" />
    </svg>
  );
}

function priceUnit(category: ListingCategory): string {
  switch (category) {
    case 'rent':
      return 'per year';
    case 'sales':
      return 'total';
    case 'short_let':
      return 'per night';
    case 'off_campus':
      return 'starting from';
  }
}

function formatPrice(value: number | null): string {
  if (value == null) return '—';
  return `₦${value.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}
