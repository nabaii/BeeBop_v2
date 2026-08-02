import { redirect } from 'next/navigation';

import { categoryRedirect, type CategorySearchParams } from '@/lib/browse-redirect';

/**
 * Off-campus is a scope of the explore surface, not a page of its own.
 * Redirecting rather than rendering keeps one filter implementation while every
 * existing link into this route keeps working.
 */
export default async function OffCampusBrowsePage({
  searchParams,
}: {
  searchParams: Promise<CategorySearchParams>;
}) {
  redirect(categoryRedirect('off_campus', await searchParams));
}
