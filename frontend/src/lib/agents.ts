/** Trusted-agent + visit-report typed clients. */

import { api } from './api';
import type { ListingCategory } from './listings';
import type { VisitStatus } from './visits';

export interface AgentVisitRow {
  visit_id: string;
  listing_id: string;
  listing_title: string;
  listing_category: ListingCategory;
  address_district: string | null;
  listing_gps_lat: number | null;
  listing_gps_lng: number | null;
  seeker_first_name: string | null;
  status: VisitStatus | 'report_pending' | 'report_queried';
  assigned_at: string | null;
  agent_confirmation_deadline: string | null;
  scheduled_at: string | null;
  visit_report_submitted_at: string | null;
}

export interface AgentBriefingPack {
  visit_id: string;
  listing_id: string;
  listing_title: string;
  listing_category: ListingCategory;
  address_line: string | null;
  district: string | null;
  listing_gps_lat: number | null;
  listing_gps_lng: number | null;
  listing_photos: Array<{ id: string; url: string; room_label: string | null }>;
  listed_amenities: Record<string, Record<string, { present?: boolean; confirmed?: boolean }> | null>;
  seeker_first_name: string | null;
  verification_status: string;
  conduct_reminders: string[];
}

export interface AmenityObservation {
  key: string;
  listed: 'present' | 'absent';
  observed: 'present' | 'not_confirmed' | 'absent';
}

export interface VisitReportReviewQueueRow {
  visit_id: string;
  listing_id: string;
  listing_title: string;
  listing_category: ListingCategory;
  seeker_first_name: string | null;
  agent_id: string;
  agent_name: string;
  submitted_at: string | null;
  status: string;
}

export interface VisitReportReviewDetail {
  visit_id: string;
  listing_id: string;
  listing_title: string;
  listing_category: ListingCategory;
  status: string;
  seeker_first_name: string | null;
  agent_name: string;
  submitted_at: string | null;
  visit_report: Record<string, unknown> | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  review_note: string | null;
}

export const agents = {
  // Activation status reuses the inspector endpoint shape — agents use this
  // wrapper so the agent portal doesn't import inspector lib.
  activationStatus: () =>
    api.get<{
      complete: boolean;
      has_profile_photo: boolean;
      nin_verified: boolean;
      conduct_acknowledged: boolean;
    }>('/agent/activation/status', { auth: true }),

  myVisits: () => api.get<AgentVisitRow[]>('/agent/visits', { auth: true }),
  briefing: (visitId: string) =>
    api.get<AgentBriefingPack>(`/agent/visits/${visitId}/briefing`, { auth: true }),

  confirm: (
    visitId: string,
    payload: { confirmed: boolean; scheduled_at?: string; conflict_reason?: string },
  ) => api.post(`/agent/visits/${visitId}/confirm`, payload, { auth: true }),

  submitReport: (
    visitId: string,
    payload: {
      visit_occurred: boolean;
      access_issues?: boolean;
      access_notes?: string;
      conduct_issues?: boolean;
      conduct_notes?: string;
      amenity_observations?: AmenityObservation[];
      discrepancies?: string;
      free_text_observations?: string;
    },
  ) => api.post(`/agent/visits/${visitId}/report`, payload, { auth: true }),

  cancelAsAgent: (visitId: string, reason: string) =>
    api.post(`/agent/visits/${visitId}/cancel`, { reason }, { auth: true }),
};

export const visitCancel = {
  // Cross-role cancel — used by seeker / landlord too.
  byActor: (visitId: string, reason: string) =>
    api.post(`/visits/${visitId}/cancel`, { reason }, { auth: true }),
};

export const adminAgents = {
  invite: (payload: { email: string; phone?: string; first_name: string; last_name: string }) =>
    api.post<{ user_id: string; email: string; invitation_sent: boolean }>(
      '/internal/admin/agents',
      payload,
      { auth: true },
    ),
  list: () =>
    api.get<
      Array<{
        id: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
        operating_area: string | null;
        activation_complete: boolean;
        created_at: string;
      }>
    >('/internal/admin/agents', { auth: true }),

  visitReportQueue: () =>
    api.get<VisitReportReviewQueueRow[]>('/internal/admin/visit-reports', { auth: true }),
  visitReportDetail: (visitId: string) =>
    api.get<VisitReportReviewDetail>(`/internal/admin/visit-reports/${visitId}`, {
      auth: true,
    }),
  approve: (visitId: string, note?: string) =>
    api.post(
      `/internal/admin/visit-reports/${visitId}/approve`,
      { note },
      { auth: true },
    ),
  query: (visitId: string, note: string) =>
    api.post(`/internal/admin/visit-reports/${visitId}/query`, { note }, { auth: true }),
  flag: (visitId: string, note: string) =>
    api.post(`/internal/admin/visit-reports/${visitId}/flag`, { note }, { auth: true }),
};
