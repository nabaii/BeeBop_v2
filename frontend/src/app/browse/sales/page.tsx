'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { CategoryBrowse } from '@/components/browse/category-browse';
import { SalesFilterFields } from '@/components/browse/category/sales-filters';
import { search, type SalesFilters } from '@/lib/search';
import { useSearch } from '@/stores/search';

const DEFAULTS: SalesFilters = {
  verification: ['fully_verified', 'doc_verified', 'unverified'],
  sort: 'relevance',
  page: 1,
  page_size: 24,
};

export default function SalesBrowsePage() {
  const router = useRouter();
  const seed = useSearch((state) => (state.category === 'sales' ? state.filters : null));
  const initialFilters = useMemo(
    () => ({ ...DEFAULTS, ...(seed ?? {}) } as SalesFilters),
    [seed],
  );
  return (
    <CategoryBrowse<SalesFilters>
      title="Homes for sale"
      emptyHint="Try widening property type or title filters."
      initialFilters={initialFilters}
      search={search.sales}
      renderCategoryFilters={(value, onChange) => (
        <SalesFilterFields value={value} onChange={onChange} />
      )}
      onPinSelect={(l) => router.push(`/listings/${l.id}`)}
    />
  );
}
