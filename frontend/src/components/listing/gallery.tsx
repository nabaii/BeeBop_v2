'use client';

/**
 * Listing gallery - a single on-page hero block (cover + supporting shots)
 * with a "Show all photos" affordance that opens a full-screen lightbox.
 * The lightbox holds every photo grouped by room, with inspector walkthrough
 * shots surfaced as their own labelled group so the page flows straight from
 * one gallery block into the property details.
 *
 * Video tours, when the landlord uploaded any, get a "Watch tour" pill on the
 * hero and their own group pinned above the room groups in the lightbox. The
 * cover is always a still image: it doubles as the browse-card thumbnail and
 * the share preview.
 *
 * `UnitGallery` below reuses the same hero + lightbox for a single off-campus
 * unit type, so a room's photos and tour behave exactly like the property's.
 */

import { BadgeCheck, CheckCircle2, ImageOff, Images, Play, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import type { PublicListingDetail, PublicUnitTypePhoto, PublicVideo } from '@/lib/search';

// Both gallery sources carry the fields the hero and lightbox need. Unit
// photos have no walkthrough flag — only the property gallery does.
type Photo = PublicListingDetail['photos'][number] | PublicUnitTypePhoto;

/** How the lightbox was opened — decides where it lands and what plays. */
type OpenIntent = 'photos' | 'video';

export function ListingGallery({ listing }: { listing: PublicListingDetail }) {
  const { listingPhotos, walkthroughPhotos } = useMemo(() => {
    const listingPhotos = listing.photos.filter((p) => !p.is_inspector_walkthrough);
    const walkthroughPhotos = listing.photos.filter((p) => p.is_inspector_walkthrough);
    return { listingPhotos, walkthroughPhotos };
  }, [listing]);

  const videos = listing.videos ?? [];
  const [intent, setIntent] = useState<OpenIntent | null>(null);

  const badges = (
    <>
      <StatusBadge status={listing.status} />
      {isVisited(listing.status) && <VisitedBadge />}
    </>
  );

  if (listingPhotos.length === 0 && walkthroughPhotos.length === 0) {
    return <NoPhotoHero badges={badges} />;
  }

  const totalPhotos = listingPhotos.length + walkthroughPhotos.length;
  // Fall back to walkthrough shots for the hero if the host added none of their own.
  const heroPhotos = listingPhotos.length > 0 ? listingPhotos : walkthroughPhotos;

  return (
    <>
      <HeroGrid
        photos={heroPhotos}
        badges={badges}
        totalPhotos={totalPhotos}
        videos={videos}
        onOpen={setIntent}
      />
      {intent !== null && (
        <PhotoLightbox
          listingPhotos={listingPhotos}
          walkthroughPhotos={walkthroughPhotos}
          videos={videos}
          intent={intent}
          onClose={() => setIntent(null)}
        />
      )}
    </>
  );
}

/**
 * One off-campus unit type's gallery. Deliberately never falls back to the
 * property's photos: showing the building where a room should be would
 * misrepresent what the seeker is booking. Callers render nothing (or their
 * own placeholder) when the unit has no photos.
 */
export function UnitGallery({
  photos,
  videos = [],
  unitName,
}: {
  photos: PublicUnitTypePhoto[];
  videos?: PublicVideo[];
  unitName: string;
}) {
  const [intent, setIntent] = useState<OpenIntent | null>(null);
  if (photos.length === 0) return null;

  return (
    <>
      <HeroGrid
        photos={photos}
        totalPhotos={photos.length}
        videos={videos}
        onOpen={setIntent}
      />
      {intent !== null && (
        <PhotoLightbox
          listingPhotos={photos}
          walkthroughPhotos={[]}
          videos={videos}
          intent={intent}
          title={unitName}
          onClose={() => setIntent(null)}
        />
      )}
    </>
  );
}

function HeroGrid({
  photos,
  badges,
  totalPhotos,
  videos,
  onOpen,
}: {
  photos: Photo[];
  badges?: ReactNode;
  totalPhotos: number;
  videos: PublicVideo[];
  onOpen: (intent: OpenIntent) => void;
}) {
  const cover = photos.find((p) => p.is_cover) ?? photos[0];
  const supporting = photos.filter((p) => p.id !== cover.id).slice(0, 2);
  const hasMore = totalPhotos > 1 + supporting.length;
  const tour = videos[0];

  return (
    <div
      className={cn(
        'grid gap-3',
        supporting.length > 0 ? 'min-[380px]:grid-cols-[2fr_0.92fr]' : 'grid-cols-1',
      )}
    >
      {/* The cover is a plain div with an overlaid button rather than one big
          button, because the tour pill below is itself a button and buttons
          can't nest. */}
      <div className="group relative aspect-[4/3] overflow-hidden rounded-[16px] bg-slate-100 shadow-sm min-[380px]:aspect-square">
        <button
          type="button"
          onClick={() => onOpen('photos')}
          aria-label="Open photo gallery"
          className="absolute inset-0 h-full w-full"
        >
          <img
            src={cover.url}
            alt={cover.room_label ?? 'Listing cover'}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        </button>
        {badges && (
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
            {badges}
          </div>
        )}
        {tour && (
          <button
            type="button"
            onClick={() => onOpen('video')}
            className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-ink/85 px-3.5 py-2 text-xs font-semibold text-paper shadow-sm backdrop-blur transition hover:bg-ink"
          >
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
            Watch tour
            {tour.duration_seconds != null && (
              <span className="tabular-nums opacity-80">
                · {formatDuration(tour.duration_seconds)}
              </span>
            )}
          </button>
        )}
        {hasMore && (
          <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-xs font-semibold text-slate-900 shadow-sm backdrop-blur">
            <Images className="h-4 w-4" aria-hidden />
            Show all {totalPhotos} photos
          </span>
        )}
      </div>
      {supporting.length > 0 && (
        <div className="grid grid-cols-2 gap-3 min-[380px]:grid-cols-1">
          {supporting.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen('photos')}
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
  videos,
  intent,
  title,
  onClose,
}: {
  listingPhotos: Photo[];
  walkthroughPhotos: Photo[];
  videos: PublicVideo[];
  intent: OpenIntent;
  title?: string;
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
  const openedForVideo = intent === 'video' && videos.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ? `${title} gallery` : 'Gallery'}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur"
    >
      <header className="flex h-14 shrink-0 items-center justify-between px-4 text-white">
        <p className="text-sm font-semibold">
          {title ? `${title} · ` : ''}
          {total} photo{total === 1 ? '' : 's'}
          {videos.length > 0 && (
            <>
              {' · '}
              {videos.length} video{videos.length === 1 ? '' : 's'}
            </>
          )}
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
          {/* Pinned above the room groups: a walkthrough is the closest thing
              to standing in the property, and it's the hardest thing to fake. */}
          {videos.length > 0 && (
            <VideoGroup videos={videos} autoPlayFirst={openedForVideo} />
          )}
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

/**
 * The video tour group.
 *
 * Two playback rules, both about not making noise the seeker didn't ask for:
 * starting one clip pauses the others, and a clip that scrolls out of view
 * pauses itself. Without the second, scrolling down to the photos leaves a
 * soundtrack playing over a picture that is no longer on screen.
 */
function VideoGroup({
  videos,
  autoPlayFirst,
}: {
  videos: PublicVideo[];
  autoPlayFirst: boolean;
}) {
  const refs = useRef<(HTMLVideoElement | null)[]>([]);
  const sectionRef = useRef<HTMLElement | null>(null);

  // Opened via "Watch tour" — bring the group into view and start the first
  // clip. Autoplay is allowed here because the click that opened the lightbox
  // is the user gesture asking for it; nothing plays on a plain photo open.
  useEffect(() => {
    if (!autoPlayFirst) return;
    sectionRef.current?.scrollIntoView({ block: 'start' });
    // A rejected play() is fine — the poster and controls are still there.
    void refs.current[0]?.play().catch(() => {});
  }, [autoPlayFirst]);

  // Pause anything that scrolls out of view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (!entry.isIntersecting && !video.paused) video.pause();
        }
      },
      { threshold: 0.35 },
    );
    for (const video of refs.current) if (video) observer.observe(video);
    return () => observer.disconnect();
  }, [videos.length]);

  const pauseOthers = (playingIndex: number) => {
    refs.current.forEach((video, i) => {
      if (i !== playingIndex && video && !video.paused) video.pause();
    });
  };

  return (
    <section ref={sectionRef} className="space-y-3 scroll-mt-4">
      <header>
        <h3 className="text-sm font-semibold text-white">Video tour</h3>
        <p className="text-xs text-white/60">Filmed by the host.</p>
      </header>
      <div className="space-y-3">
        {videos.map((video, i) => (
          <figure key={video.id} className="space-y-1.5">
            <div className="overflow-hidden rounded-2xl bg-black">
              <video
                ref={(el) => {
                  refs.current[i] = el;
                }}
                src={video.url}
                poster={video.poster_url ?? undefined}
                controls
                playsInline
                // Nothing is fetched until the seeker presses play. On mobile
                // data that difference is the whole point of the poster.
                preload="none"
                onPlay={() => pauseOthers(i)}
                className="h-auto w-full"
              />
            </div>
            {video.room_label && (
              <figcaption className="text-xs text-white/60">{video.room_label}</figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
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

function NoPhotoHero({ badges }: { badges?: ReactNode }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[16px] bg-slate-100 shadow-sm min-[380px]:aspect-square">
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
        <ImageOff className="h-8 w-8" aria-hidden />
        <span className="text-xs font-medium">No photos yet</span>
      </div>
      {badges && <div className="absolute left-3 top-3 flex flex-wrap gap-2">{badges}</div>}
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
