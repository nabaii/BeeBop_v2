'use client';

import { useRouter } from 'next/navigation';

import { CategoryBrowse } from '@/components/browse/category-browse';
import { RentFilterFields } from '@/components/browse/category/rent-filters';
import { search, type RentFilters } from '@/lib/search';

const DEFAULTS: RentFilters = {
  verification: ['fully_verified', 'doc_verified'],
  sort: 'relevance',
  page: 1,
  page_size: 24,
};

export default function RentBrowsePage() {
  const router = useRouter();
  return (
    <CategoryBrowse<RentFilters>
      title="Homes for rent"
      emptyHint="Try clearing bedroom or property-type filters."
      initialFilters={DEFAULTS}
      search={search.rent}
      renderCategoryFilters={(value, onChange) => (
        <RentFilterFields value={value} onChange={onChange} />
      )}
      onPinSelect={(l) => router.push(`/listings/${l.id}`)}
    />
  );
}
