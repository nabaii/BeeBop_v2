/** Dashboard endpoint clients. */

import { api } from './api';
import type { ListingCategory, ListingStatus } from './listings';

export interface SeekerOverview {
  saved_count: number;
  active_offers_count: number;
  agreements_count: number;
  unread_notifications: number;
}

export interface CountByStatus {
  status: ListingStatus;
  count: number;
}

export interface MonthlyIncome {
  month: string;
  amount: number;
}

export interface ListingRevenueStats {
  listing_id: string;
  title: string | null;
  category: ListingCategory;
  status: ListingStatus;
  price: number | null;
  total_income: number;
  occupancy_rate: number;
  view_count: number;
  save_count: number;
  enquiry_count: number;
  cover_photo_url?: string | null;
}

export interface LandlordOverview {
  listings_total: number;
  listings_by_status: CountByStatus[];
  pending_offers_count: number;
  unread_notifications: number;
  total_income: number;
  occupancy_rate: number;
  monthly_income: MonthlyIncome[];
  listing_stats: ListingRevenueStats[];
}

export interface ListingAnalytics {
  listing_id: string;
  title: string | null;
  category: ListingCategory;
  view_count: number;
  save_count: number;
  enquiry_count: number;
}

export interface GenderBreakdown {
  female_total: number;
  female_available: number;
  male_total: number;
  male_available: number;
  any_total: number;
  any_available: number;
}

export interface UnitOccupancy {
  unit_type_id: string;
  unit_name: string;
  kind: string;
  beds_per_room: number;
  total_units: number;
  breakdown: GenderBreakdown;
}

export interface StudentPMS {
  listing_id: string;
  listing_title: string | null;
  overall: GenderBreakdown;
  units: UnitOccupancy[];
  waitlist_total: number;
}

export interface ShortLetPricingView {
  base_rate: number | null;
  weekend_rate: number | null;
  min_stay_nights: number | null;
  turnaround_days: number | null;
  instant_booking: boolean | null;
}

export interface ShortLetCalendarDay {
  date: string;
  state: 'available' | 'booked' | 'turnaround';
  is_weekend: boolean;
  rate: number | null;
}

export interface ShortLetDashboardData {
  listing_id: string;
  title: string | null;
  pricing: ShortLetPricingView;
  calendar: { listing_id: string; days: ShortLetCalendarDay[] };
  upcoming_bookings_count: number;
  pending_booking_requests: number;
  revenue_30d: number;
  occupancy_30d_pct: number;
}

export const dashboards = {
  seeker: () => api.get<SeekerOverview>('/dashboard/seeker/overview', { auth: true }),
  landlord: () => api.get<LandlordOverview>('/dashboard/landlord/overview', { auth: true }),
  landlordAnalytics: () =>
    api.get<ListingAnalytics[]>('/dashboard/landlord/analytics', { auth: true }),
  studentPMS: (listingId: string) =>
    api.get<StudentPMS>(`/dashboard/student/${listingId}`, { auth: true }),
  shortLet: (listingId: string, days = 14) =>
    api.get<ShortLetDashboardData>(
      `/dashboard/short-let/${listingId}?days=${days}`,
      { auth: true },
    ),
};
