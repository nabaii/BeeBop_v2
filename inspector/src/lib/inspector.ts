/** Typed wrappers for /inspector/* endpoints. */

import { api } from './api';

export type InspectionReportStatus =
  | 'assigned'
  | 'in_progress'
  | 'pending'
  | 'approved'
  | 'queried'
  | 'rejected';

export type ListingCategory = 'off_campus' | 'short_let' | 'rent' | 'sales';

export interface AssignmentRow {
  report_id: string;
  listing_id: string;
  listing_title: string;
  listing_category: ListingCategory;
  address_district: string | null;
  listing_gps_lat: number | null;
  listing_gps_lng: number | null;
  status: InspectionReportStatus;
  assigned_at: string | null;
  submitted_at: string | null;
}

export interface BriefingPack {
  report_id: string;
  listing_id: string;
  listing_title: string;
  listing_subtitle: string | null;
  listing_category: ListingCategory;
  description: string | null;
  district: string | null;
  address_line: string | null;
  listing_gps_lat: number | null;
  listing_gps_lng: number | null;
  cover_photo_url: string | null;
  listing_photos: Array<{ id: string; url: string; room_label: string | null }>;
  listed_amenities: Record<string, Record<string, { present?: boolean; confirmed?: boolean }> | null>;
  seeker_first_name?: string | null;
}

export interface EvidenceItem {
  s3_key: string;
  filename: string;
  content_type: string;
  captured_at: string;
  gps_lat: number | null;
  gps_lng: number | null;
  note?: string | null;
}

export interface ReportView {
  id: string;
  listing_id: string;
  inspector_id: string;
  status: InspectionReportStatus;
  assessment: Record<string, unknown>;
  evidence: EvidenceItem[];
  visit_gps_lat: number | null;
  visit_gps_lng: number | null;
  inspector_note: string | null;
  submitted_at: string | null;
  review_note: string | null;
}

export const inspector = {
  // Activation
  acknowledgeConduct: () => api.post('/inspector/activation/conduct'),
  activationStatus: () =>
    api.get<{
      complete: boolean;
      has_profile_photo: boolean;
      nin_verified: boolean;
      conduct_acknowledged: boolean;
    }>('/inspector/activation/status'),

  // Assignments
  myAssignments: () => api.get<AssignmentRow[]>('/inspector/assignments'),
  briefing: (reportId: string) =>
    api.get<BriefingPack>(`/inspector/reports/${reportId}/briefing`),

  // Reports
  getReport: (reportId: string) => api.get<ReportView>(`/inspector/reports/${reportId}`),
  saveDraft: (
    reportId: string,
    payload: {
      assessment?: Record<string, unknown>;
      inspector_note?: string;
      visit_gps_lat?: number;
      visit_gps_lng?: number;
    },
  ) => api.patch<ReportView>(`/inspector/reports/${reportId}`, payload),
  submit: (reportId: string) =>
    api.post<ReportView>(`/inspector/reports/${reportId}/submit`),

  // Evidence
  evidenceSignature: (
    reportId: string,
    payload: {
      filename: string;
      content_type: string;
      captured_at: string;
      gps_lat?: number;
      gps_lng?: number;
      size_bytes?: number;
    },
  ) =>
    api.post<{ url: string; s3_key: string; headers: Record<string, string> }>(
      `/inspector/reports/${reportId}/evidence/signature`,
      payload,
    ),
  registerEvidence: (
    reportId: string,
    payload: {
      s3_key: string;
      filename: string;
      content_type: string;
      captured_at: string;
      gps_lat?: number;
      gps_lng?: number;
      note?: string;
    },
  ) =>
    api.post<ReportView>(`/inspector/reports/${reportId}/evidence`, payload),

  // Infrastructure score
  scoreArea: (
    reportId: string,
    payload: {
      lat: number;
      lng: number;
      road_condition?: number;
      electricity_supply_hours?: number;
      security?: number;
      proximity?: number;
    },
  ) =>
    api.post<{ cell_lat: number; cell_lng: number; last_assessed_at: string | null }>(
      `/inspector/reports/${reportId}/infrastructure-score`,
      payload,
    ),
};

// Profile helpers (re-uses the main /users routes)
export const inspectorProfile = {
  setPhoto: (profile_photo_url: string) =>
    api.patch('/users/me/profile', { profile_photo_url }),
  photoUploadSignature: () =>
    api.post<{
      cloud_name: string;
      api_key: string;
      timestamp: number;
      signature: string;
      folder: string;
    }>('/users/me/photo-upload'),
  verifyNin: (nin: string) =>
    api.post<{ verified: boolean; admin_review: boolean }>('/users/me/verify-nin', { nin }),
  setIdentity: (args: { first_name: string; last_name: string }) =>
    api.patch('/users/me/identity', args),
};
