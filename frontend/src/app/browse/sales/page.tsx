import { redirect } from 'next/navigation';

import { categoryRedirect, type CategorySearchParams } from '@/lib/browse-redirect';

/** A scope of the explore surface — see `browse/off-campus/page.tsx`. */
export default async function SalesBrowsePage({
  searchParams,
}: {
  searchParams: Promise<CategorySearchParams>;
}) {
  redirect(categoryRedirect('sales', await searchParams));
}
