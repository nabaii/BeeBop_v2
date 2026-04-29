'use client';

import { useRouter } from 'next/navigation';

import { CategoryBrowse } from '@/components/browse/category-browse';
import { OffCampusFilterFields } from '@/components/browse/category/off-campus-filters';
import { search, type OffCampusFilters } from '@/lib/search';

const DEFAULTS: OffCampusFilters = {
  verification: ['fully_verified', 'doc_verified'],
  sort: 'relevance',
  page: 1,
  page_size: 24,
};

export default function OffCampusBrowsePage() {
  const router = useRouter();
  return (
    <CategoryBrowse<OffCampusFilters>
      title="Off-campus accommodation"
      emptyHint="Try widening the location or unit-type filters."
      initialFilters={DEFAULTS}
      search={search.offCampus}
      renderCategoryFilters={(value, onChange) => (
        <OffCampusFilterFields value={value} onChange={onChange} />
      )}
      onPinSelect={(l) => router.push(`/listings/${l.id}`)}
    />
  );
}
