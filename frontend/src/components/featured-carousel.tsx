'use client';

import { ListingCarousel } from '@/components/listing-carousel';
import { getFeaturedListings, type PublicListingSummary } from '@/lib/search';

// Module-level so the reference is stable across renders (the carousel keys its
// load effect on the fetcher). Request a generous page of live listings; if the
// backend rejects the size (older deploys cap this lower and return 422), fall
// back to a conservative limit so a frontend/backend deploy-order mismatch can
// never silently blank the whole row.
function fetchFeatured(): Promise<PublicListingSummary[]> {
  return getFeaturedListings(50).catch(() => getFeaturedListings(12));
}

export function FeaturedCarousel({ showBrowseLink = true }: { showBrowseLink?: boolean }) {
  return (
    <ListingCarousel
      title="Properties in Abuja"
      fetcher={fetchFeatured}
      seeAllHref={showBrowseLink ? '/browse' : undefined}
    />
  );
}
