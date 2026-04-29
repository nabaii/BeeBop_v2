'use client';

import { useRouter } from 'next/navigation';

import { CategoryBrowse } from '@/components/browse/category-browse';
import { SalesFilterFields } from '@/components/browse/category/sales-filters';
import { search, type SalesFilters } from '@/lib/search';

const DEFAULTS: SalesFilters = {
  verification: ['fully_verified', 'doc_verified'],
  sort: 'relevance',
  page: 1,
  page_size: 24,
};

export default function SalesBrowsePage() {
  const router = useRouter();
  return (
    <CategoryBrowse<SalesFilters>
      title="Homes for sale"
      emptyHint="Try widening property type or title filters."
      initialFilters={DEFAULTS}
      search={search.sales}
      renderCategoryFilters={(value, onChange) => (
        <SalesFilterFields value={value} onChange={onChange} />
      )}
      onPinSelect={(l) => router.push(`/listings/${l.id}`)}
    />
  );
}
