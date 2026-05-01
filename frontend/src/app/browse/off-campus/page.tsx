'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { CategoryBrowse } from '@/components/browse/category-browse';
import { OffCampusFilterFields } from '@/components/browse/category/off-campus-filters';
import { search, type OffCampusFilters } from '@/lib/search';
import { useSearch } from '@/stores/search';

const DEFAULTS: OffCampusFilters = {
  verification: ['fully_verified', 'doc_verified'],
  sort: 'relevance',
  page: 1,
  page_size: 24,
};

export default function OffCampusBrowsePage() {
  const router = useRouter();
  const seed = useSearch((state) => (state.category === 'off_campus' ? state.filters : null));
  const initialFilters = useMemo(
    () => ({ ...DEFAULTS, ...(seed ?? {}) } as OffCampusFilters),
    [seed],
  );
  return (
    <CategoryBrowse<OffCampusFilters>
      title="Off-campus accommodation"
      emptyHint="Try widening the location or unit-type filters."
      initialFilters={initialFilters}
      search={search.offCampus}
      renderCategoryFilters={(value, onChange) => (
        <OffCampusFilterFields value={value} onChange={onChange} />
      )}
      onPinSelect={(l) => router.push(`/listings/${l.id}`)}
    />
  );
}
