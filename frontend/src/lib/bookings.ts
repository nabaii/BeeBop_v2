/** Short-let booking client. */

import { api } from './api';

export type BookingStatus = 'requested' | 'confirmed' | 'cancelled' | 'completed';

export interface BookingQuote {
  nights: number;
  base_total: number;
  weekend_uplift: number;
  seeker_fee: number;
  grand_total: number;
  host_payout: number;
  instant_booking: boolean;
  min_stay_satisfied: boolean;
}

export interface BookingView {
  id: string;
  listing_id: string;
  listing_title: string;
  seeker_id: string;
  seeker_first_name: string | null;
  host_id: string;
  host_first_name: string | null;
  check_in: string;
  check_out: string;
  guest_count: number;
  status: BookingStatus;
  instant_booking: boolean;
  base_total: number;
  weekend_uplift: number;
  seeker_fee: number;
  host_fee: number;
  grand_total: number;
  payment_confirmed_at: string | null;
  decided_at: string | null;
  decision_deadline: string | null;
  decline_reason: string | null;
  access_details_visible: boolean;
  access_details: string | null;
  checked_in_at: string | null;
  payout_at: string | null;
  payout_amount: number | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  paystack_authorization_url: string | null;
}

export interface CalendarBlock {
  date: string;
  state: 'booked' | 'turnaround';
  booking_id: string;
}

export const bookings = {
  quote: (
    listingId: string,
    payload: { check_in: string; check_out: string; guest_count?: number },
  ) => api.post<BookingQuote>(`/bookings/listing/${listingId}/quote`, payload),

  create: (
    listingId: string,
    payload: { check_in: string; check_out: string; guest_count?: number },
  ) => api.post<BookingView>(`/bookings/listing/${listingId}`, payload, { auth: true }),

  accept: (bookingId: string) =>
    api.post<BookingView>(`/bookings/${bookingId}/accept`, undefined, { auth: true }),
  decline: (bookingId: string, reason: string) =>
    api.post<BookingView>(`/bookings/${bookingId}/decline`, { reason }, { auth: true }),
  cancel: (bookingId: string, reason: string) =>
    api.post<BookingView>(`/bookings/${bookingId}/cancel`, { reason }, { auth: true }),

  setAccessDetails: (bookingId: string, access_details: string) =>
    api.post<BookingView>(
      `/bookings/${bookingId}/access-details`,
      { access_details },
      { auth: true },
    ),
  confirmCheckIn: (bookingId: string) =>
    api.post<BookingView>(`/bookings/${bookingId}/check-in`, undefined, { auth: true }),

  myBookings: () => api.get<BookingView[]>('/bookings/mine', { auth: true }),
  hostBookings: (listingId?: string) => {
    const qs = listingId ? `?listing_id=${listingId}` : '';
    return api.get<BookingView[]>(`/bookings/host${qs}`, { auth: true });
  },
  calendar: (listingId: string) =>
    api.get<CalendarBlock[]>(`/bookings/listing/${listingId}/calendar`),
};
