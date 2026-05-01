'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { CategoryBrowse } from '@/components/browse/category-browse';
import { ShortLetFilterFields } from '@/components/browse/category/short-let-filters';
import { search, type ShortLetFilters } from '@/lib/search';
import { useSearch } from '@/stores/search';

const DEFAULTS: ShortLetFilters = {
  verification: ['fully_verified', 'doc_verified'],
  sort: 'relevance',
  page: 1,
  page_size: 24,
};

export default function ShortLetBrowsePage() {
  const router = useRouter();
  const seed = useSearch((state) => (state.category === 'short_let' ? state.filters : null));
  const initialFilters = useMemo(
    () => ({ ...DEFAULTS, ...(seed ?? {}) } as ShortLetFilters),
    [seed],
  );
  return (
    <CategoryBrowse<ShortLetFilters>
      title="Short-let stays"
      emptyHint="Try widening the date range or clearing the instant-booking filter."
      initialFilters={initialFilters}
      search={search.shortLet}
      renderCategoryFilters={(value, onChange) => (
        <ShortLetFilterFields value={value} onChange={onChange} />
      )}
      onPinSelect={(l) => router.push(`/listings/${l.id}`)}
    />
  );
}
