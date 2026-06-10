import { cn } from '@/lib/cn';

/** Base shimmer block. Compose it for richer loading placeholders. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200', className)} aria-hidden />;
}

/** Loading placeholder shaped like a ListingCard (4:3 cover + title/price lines). */
export function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
