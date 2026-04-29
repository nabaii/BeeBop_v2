/** Typed wrappers for the /offers endpoints. */

import { api } from './api';
import type { ListingCategory } from './listings';

export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'countered'
  | 'expired'
  | 'withdrawn';

export interface OfferRoundView {
  id: string;
  round_number: number;
  price: number;
  conditions: string | null;
  submitted_by: 'seeker' | 'landlord';
  created_at: string;
}

export interface OfferThreadView {
  listing_id: string;
  listing_title: string;
  listing_category: ListingCategory;
  seeker_id: string;
  seeker_name: string;
  landlord_id: string;
  landlord_name: string;
  current_offer_id: string;
  status: OfferStatus;
  awaiting_landlord_response: boolean;
  expires_at: string;
  move_in_date: string | null;
  requires_visit_before_acceptance: boolean;
  visit_id: string | null;
  rounds: OfferRoundView[];
}

export const offers = {
  submit: (
    listingId: string,
    payload: { price: number; move_in_date?: string; conditions?: string },
  ) => api.post<OfferThreadView>(`/offers/listing/${listingId}`, payload, { auth: true }),

  accept: (offerId: string) =>
    api.post<OfferThreadView>(`/offers/${offerId}/accept`, undefined, { auth: true }),

  counter: (offerId: string, payload: { price: number; conditions?: string }) =>
    api.post<OfferThreadView>(`/offers/${offerId}/counter`, payload, { auth: true }),

  reject: (offerId: string, reason?: string) =>
    api.post<OfferThreadView>(`/offers/${offerId}/reject`, { reason }, { auth: true }),

  myOffers: () => api.get<OfferThreadView[]>('/offers/mine', { auth: true }),
  landlordOffers: () => api.get<OfferThreadView[]>('/offers/landlord', { auth: true }),
};

/** Maximum counter rounds per dev plan §8.3. Exposed here so the UI can
 *  disable the Counter button on round 3. */
export const MAX_OFFER_ROUNDS = 3;
