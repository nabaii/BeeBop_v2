/**
 * Server-side redirect helper for the legacy `/browse/<category>` routes.
 *
 * Those routes now funnel into the one explore surface at `/browse?cat=…`.
 * Redirecting (rather than rendering a second copy of the filter UI) keeps a
 * single code path while leaving every existing link — sidebar, chat "see
 * all", admin shell, shared URLs — working untouched.
 *
 * Any query string on the incoming request is carried through, so deep links
 * like `/browse/rent?q=duplex` still land on a filtered result set.
 */

import type { Route } from 'next';

import type { ListingCategory } from './listings';

export type CategorySearchParams = Record<string, string | string[] | undefined>;

export function categoryRedirect(
  category: ListingCategory,
  searchParams: CategorySearchParams,
): Route {
  const params = new URLSearchParams();
  params.set('cat', category);

  for (const [key, value] of Object.entries(searchParams)) {
    // `cat` is set by the route itself and must not be overridden by the
    // incoming query.
    if (value === undefined || key === 'cat') continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
      continue;
    }
    params.append(key, value);
  }

  return `/browse?${params.toString()}` as Route;
}
