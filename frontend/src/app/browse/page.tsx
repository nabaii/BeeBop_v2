import { Suspense } from 'react';

import { ExploreBrowse } from '@/components/browse/explore-browse';
import { LoadingScreen } from '@/components/ui/loading-screen';

export default function BrowsePage() {
  // ExploreBrowse reads filter state from useSearchParams, which needs a
  // Suspense boundary to keep the route from opting the whole page into
  // client-side rendering.
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ExploreBrowse />
    </Suspense>
  );
}
