import { redirect } from 'next/navigation';

import { categoryRedirect, type CategorySearchParams } from '@/lib/browse-redirect';

/** A scope of the explore surface — see `browse/off-campus/page.tsx`. */
export default async function ShortLetBrowsePage({
  searchParams,
}: {
  searchParams: Promise<CategorySearchParams>;
}) {
  redirect(categoryRedirect('short_let', await searchParams));
}
