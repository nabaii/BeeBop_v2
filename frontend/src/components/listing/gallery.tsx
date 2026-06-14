'use client';

/**
 * Listing gallery - room-grouped. Inspector walkthrough shots are surfaced
 * as a separately labelled section below the main gallery.
 */

import { BadgeCheck, CheckCircle2, ImageOff } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/cn';
import type { PublicListingDetail } from '@/lib/search';

export function ListingGallery({ listing }: { listing: PublicListingDetail }) {
  const { listingPhotos, walkthroughPhotos } = useMemo(() => {
    const listingPhotos = listing.photos.filter((p) => !p.is_inspector_walkthrough);
    const walkthroughPhotos = listing.photos.filter((p) => p.is_inspector_walkthrough);
    return { listingPhotos, walkthroughPhotos };
  }, [listing]);

  return (
    <div className="space-y-5">
      {listingPhotos.length > 0 ? (
        <HeroGrid photos={listingPhotos} listing={listing} />
      ) : (
        <NoPhotoHero listing={listing} />
      )}
      {listingPhotos.length > 4 && <FullScrollRow photos={listingPhotos} />}
      {walkthroughPhotos.length > 0 && (
        <section className="space-y-3">
          <header>
            <h3 className="text-sm font-semibold text-slate-900">Beebop Verified Walkthrough</h3>
            <p className="text-xs text-slate-500">
              Taken during an independent on-site inspection.
            </p>
          </header>
          <FullScrollRow photos={walkthroughPhotos} />
        </section>
      )}
    </div>
  );
}

function HeroGrid({
  photos,
  listing,
}: {
  photos: PublicListingDetail['photos'];
  listing: PublicListingDetail;
}) {
  const cover = photos.find((p) => p.is_cover) ?? photos[0];
  const supporting = photos.filter((p) => p.id !== cover.id).slice(0, 2);

  return (
    <div
      className={cn(
        'grid gap-3',
        supporting.length > 0 ? 'min-[380px]:grid-cols-[2fr_0.92fr]' : 'grid-cols-1',
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-[16px] bg-slate-100 shadow-sm min-[380px]:aspect-square">
        <img
          src={cover.url}
          alt={cover.room_label ?? 'Listing cover'}
          className="h-full w-full object-cover"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <StatusBadge status={listing.status} />
          {isVisited(listing.status) && <VisitedBadge />}
        </div>
      </div>
      {supporting.length > 0 && (
        <div className="grid grid-cols-2 gap-3 min-[380px]:grid-cols-1">
          {supporting.map((p) => (
            <div
              key={p.id}
              className="aspect-[4/3] overflow-hidden rounded-[14px] bg-slate-100 shadow-sm min-[380px]:aspect-square"
            >
              <img
                src={p.url}
                alt={p.room_label ?? 'Listing photo'}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FullScrollRow({ photos }: { photos: PublicListingDetail['photos'] }) {
  const groups = useMemo(() => {
    const by = new Map<string, PublicListingDetail['photos']>();
    for (const p of photos) {
      const key = p.room_label ?? 'Other';
      if (!by.has(key)) by.set(key, []);
      by.get(key)!.push(p);
    }
    return Array.from(by.entries());
  }, [photos]);

  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">
          {photos.length} photo{photos.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs font-semibold text-orange-700 hover:underline"
        >
          {expanded ? 'Show less' : 'Show all'}
        </button>
      </div>
      <div className={expanded ? 'space-y-4' : 'overflow-hidden'}>
        {(expanded ? groups : groups.slice(0, 1)).map(([label, items]) => (
          <section key={label} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </h4>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {items.map((p) => (
                <div
                  key={p.id}
                  className="aspect-[4/3] w-64 shrink-0 overflow-hidden rounded-[14px] bg-slate-100"
                >
                  <img
                    src={p.url}
                    alt={p.room_label ?? label}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function NoPhotoHero({ listing }: { listing: PublicListingDetail }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[16px] bg-slate-100 shadow-sm min-[380px]:aspect-square">
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
        <ImageOff className="h-8 w-8" aria-hidden />
        <span className="text-xs font-medium">No photos yet</span>
      </div>
      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
        <StatusBadge status={listing.status} />
        {isVisited(listing.status) && <VisitedBadge />}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PublicListingDetail['status'] }) {
  const fullyVerified = ['fully_verified', 'let_agreed', 'sale_agreed'].includes(status);
  const docVerified = status === 'doc_verified';
  const label = fullyVerified ? 'AGIS Verified' : docVerified ? 'Doc Verified' : 'Unverified';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-caption font-bold uppercase tracking-wide text-white shadow-sm',
        fullyVerified && 'bg-verification-fully',
        docVerified && 'bg-verification-doc',
        !fullyVerified && !docVerified && 'bg-verification-unverified',
      )}
    >
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

function VisitedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-300 px-3 py-1 text-caption font-bold uppercase tracking-wide text-orange-900 shadow-sm">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      Visited
    </span>
  );
}

function isVisited(status: PublicListingDetail['status']): boolean {
  return ['fully_verified', 'let_agreed', 'sale_agreed'].includes(status);
}
