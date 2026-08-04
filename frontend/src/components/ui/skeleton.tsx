import { cn } from '@/lib/cn';

/** Base shimmer block. Compose it for richer loading placeholders. */
export function Skeleton({ className }: { className?: string }) {
  // Warm shimmer: a cold gray pulse against Paper reads as a rendering fault
  // rather than a loading state.
  return <div className={cn('animate-pulse rounded-md bg-hairline', className)} aria-hidden />;
}

/**
 * Loading placeholder shaped like a ListingCard.
 *
 * Mirrors the real card's geometry — same radius, same hairline border, same
 * 4:3 cover and body padding — so nothing shifts when results arrive.
 */
export function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-white">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-2 p-3.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}
