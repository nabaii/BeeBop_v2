/** Bookmark endpoint wrappers. Save is idempotent server-side. */

import { api } from './api';
import type { PublicListingSummary } from './search';

export function saveListing(listingId: string): Promise<void> {
  return api.post(`/bookmarks/${listingId}`, undefined, { auth: true }).then(() => undefined);
}

export function unsaveListing(listingId: string): Promise<void> {
  return api.delete(`/bookmarks/${listingId}`, { auth: true }).then(() => undefined);
}

export function listSavedListings(): Promise<PublicListingSummary[]> {
  return api.get('/bookmarks', { auth: true });
}
