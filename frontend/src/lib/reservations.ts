/** Off-campus 'Book now' reservation client. */

import { api } from './api';

export type ReservationStatus = 'pending_payment' | 'confirmed' | 'cancelled';

export interface ReservationQuote {
  unit_type_id: string;
  unit_type_name: string;
  price_period: string;
  base_total: number;
  seeker_fee: number;
  grand_total: number;
  beds_available: number;
}

export interface ReservationView {
  id: string;
  listing_id: string;
  listing_title: string;
  seeker_id: string;
  unit_type_id: string;
  unit_type_name: string;
  price_period: string;
  status: ReservationStatus;
  base_total: number;
  seeker_fee: number;
  grand_total: number;
  payment_confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  paystack_authorization_url: string | null;
}

export const reservations = {
  quote: (listingId: string, unitTypeId: string) =>
    api.get<ReservationQuote>(
      `/reservations/listing/${listingId}/quote/${unitTypeId}`,
    ),

  create: (listingId: string, unitTypeId: string) =>
    api.post<ReservationView>(
      `/reservations/listing/${listingId}`,
      { unit_type_id: unitTypeId },
      { auth: true },
    ),

  cancel: (reservationId: string, reason: string) =>
    api.post<ReservationView>(
      `/reservations/${reservationId}/cancel`,
      { reason },
      { auth: true },
    ),

  mine: () => api.get<ReservationView[]>('/reservations/mine', { auth: true }),
};
