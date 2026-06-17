'use client';

/**
 * Listing gallery - a single on-page hero block (cover + supporting shots)
 * with a "Show all photos" affordance that opens a full-screen lightbox.
 * The lightbox holds every photo grouped by room, with inspector walkthrough
 * shots surfaced as their own labelled group so the page flows straight from
 * one gallery block into the property details.
 */

import { BadgeCheck, CheckCircle2, ImageOff, Images, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/cn';
import type { PublicListingDetail } from '@/lib/search';

type Photo = PublicListingDetail['photos'][number];

export function ListingGallery({ listing }: { listing: PublicListingDetail }) {
  const { listingPhotos, walkthroughPhotos } = useMemo(() => {
    const listingPhotos = listing.photos.filter((p) => !p.is_inspector_walkthrough);
    const walkthroughPhotos = listing.photos.filter((p) => p.is_inspector_walkthrough);
    return { listingPhotos, walkthroughPhotos };
  }, [listing]);

  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (listingPhotos.length === 0 && walkthroughPhotos.length === 0) {
    return <NoPhotoHero listing={listing} />;
  }

  const totalPhotos = listingPhotos.length + walkthroughPhotos.length;
  // Fall back to walkthrough shots for the hero if the host added none of their own.
  const heroPhotos = listingPhotos.length > 0 ? listingPhotos : walkthroughPhotos;

  return (
    <>
      <HeroGrid
        photos={heroPhotos}
        listing={listing}
        totalPhotos={totalPhotos}
        onOpen={() => setLightboxOpen(true)}
      />
      {lightboxOpen && (
        <PhotoLightbox
          listingPhotos={listingPhotos}
          walkthroughPhotos={walkthroughPhotos}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

function HeroGrid({
  photos,
  listing,
  totalPhotos,
  onOpen,
}: {
  photos: Photo[];
  listing: PublicListingDetail;
  totalPhotos: number;
  onOpen: () => void;
}) {
  const cover = photos.find((p) => p.is_cover) ?? photos[0];
  const supporting = photos.filter((p) => p.id !== cover.id).slice(0, 2);
  const hasMore = totalPhotos > 1 + supporting.length;

  return (
    <div
      className={cn(
        'grid gap-3',
        supporting.length > 0 ? 'min-[380px]:grid-cols-[2fr_0.92fr]' : 'grid-cols-1',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open photo gallery"
        className="group relative aspect-[4/3] overflow-hidden rounded-[16px] bg-slate-100 shadow-sm min-[380px]:aspect-square"
      >
        <img
          src={cover.url}
          alt={cover.room_label ?? 'Listing cover'}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <StatusBadge status={listing.status} />
          {isVisited(listing.status) && <VisitedBadge />}
        </div>
        {hasMore && (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-xs font-semibold text-slate-900 shadow-sm backdrop-blur">
            <Images className="h-4 w-4" aria-hidden />
            Show all {totalPhotos} photos
          </span>
        )}
      </button>
      {supporting.length > 0 && (
        <div className="grid grid-cols-2 gap-3 min-[380px]:grid-cols-1">
          {supporting.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={onOpen}
              aria-label="Open photo gallery"
              className="group aspect-[4/3] overflow-hidden rounded-[14px] bg-slate-100 shadow-sm min-[380px]:aspect-square"
            >
              <img
                src={p.url}
                alt={p.room_label ?? 'Listing photo'}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoLightbox({
  listingPhotos,
  walkthroughPhotos,
  onClose,
}: {
  listingPhotos: Photo[];
  walkthroughPhotos: Photo[];
  onClose: () => void;
}) {
  // Esc to close + lock the page behind the full-screen viewer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const groups = useGroupedByRoom(listingPhotos);
  const total = listingPhotos.length + walkthroughPhotos.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur"
    >
      <header className="flex h-14 shrink-0 items-center justify-between px-4 text-white">
        <p className="text-sm font-semibold">
          {total} photo{total === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close gallery"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-16">
        <div className="mx-auto max-w-2xl space-y-8">
          {groups.map(([label, items]) => (
            <PhotoGroup key={label} label={label} items={items} />
          ))}
          {walkthroughPhotos.length > 0 && (
            <section className="space-y-3">
              <header>
                <h3 className="text-sm font-semibold text-white">Beebop Verified Walkthrough</h3>
                <p className="text-xs text-white/60">
                  Taken during an independent on-site inspection.
                </p>
              </header>
              <div className="space-y-3">
                {walkthroughPhotos.map((p) => (
                  <LightboxImage key={p.id} photo={p} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function PhotoGroup({ label, items }: { label: string; items: Photo[] }) {
  return (
    <section className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-white/60">{label}</h4>
      <div className="space-y-3">
        {items.map((p) => (
          <LightboxImage key={p.id} photo={p} />
        ))}
      </div>
    </section>
  );
}

function LightboxImage({ photo }: { photo: Photo }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-slate-900">
      <img
        src={photo.url}
        alt={photo.room_label ?? 'Listing photo'}
        className="h-auto w-full object-contain"
      />
    </div>
  );
}

function useGroupedByRoom(photos: Photo[]): [string, Photo[]][] {
  return useMemo(() => {
    const by = new Map<string, Photo[]>();
    for (const p of photos) {
      const key = p.room_label ?? 'Other';
      if (!by.has(key)) by.set(key, []);
      by.get(key)!.push(p);
    }
    return Array.from(by.entries());
  }, [photos]);
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
