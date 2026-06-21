import { ListingCardSkeleton } from 'beebop-frontend';

export function Default() {
  return (
    <div style={{ maxWidth: 260 }}>
      <ListingCardSkeleton />
    </div>
  );
}

export function LoadingGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, maxWidth: 560 }}>
      <ListingCardSkeleton />
      <ListingCardSkeleton />
      <ListingCardSkeleton />
      <ListingCardSkeleton />
    </div>
  );
}
