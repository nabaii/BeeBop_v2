/** Typed client for the /internal/admin endpoints. */

import { api } from './api';
import type { ListingCategory, ListingStatus } from './listings';

export type InspectionReportStatus =
  | 'assigned'
  | 'in_progress'
  | 'pending'
  | 'approved'
  | 'queried'
  | 'rejected';

export interface DocReviewQueueRow {
  listing_id: string;
  title: string;
  category: ListingCategory;
  landlord_name: string;
  landlord_id: string;
  submitted_at: string;
  document_count: number;
}

export interface DocReviewQueue {
  items: DocReviewQueueRow[];
  total: number;
}

export interface AreaScoreView {
  cell_lat: number | null;
  cell_lng: number | null;
  road_condition: number | null;
  electricity_supply_hours: number | null;
  security: number | null;
  proximity: number | null;
  last_assessed_at: string | null;
}

export interface InspectionReviewQueueRow {
  report_id: string;
  listing_id: string;
  listing_title: string;
  category: ListingCategory;
  inspector_name: string;
  landlord_name: string;
  submitted_at: string | null;
  status: InspectionReportStatus;
}

export interface InspectionReviewQueue {
  items: InspectionReviewQueueRow[];
  total: number;
}

export interface InspectionEvidenceView {
  filename: string;
  content_type: string;
  captured_at: string;
  gps_lat: number | null;
  gps_lng: number | null;
  note: string | null;
  url: string | null;
}

export interface InspectionReviewDetail {
  report_id: string;
  listing_id: string;
  listing_title: string;
  category: ListingCategory;
  status: InspectionReportStatus;
  inspector_name: string;
  landlord_name: string;
  submitted_at: string | null;
  inspector_note: string | null;
  review_note: string | null;
  address_line: string | null;
  district: string | null;
  visit_gps_lat: number | null;
  visit_gps_lng: number | null;
  assessment: Record<string, unknown>;
  evidence: InspectionEvidenceView[];
  area_score: AreaScoreView | null;
}

export interface AdminListingRow {
  id: string;
  title: string | null;
  category: ListingCategory;
  status: ListingStatus;
  landlord_id: string;
  landlord_name: string;
  created_at: string;
  suspended_at: string | null;
  deleted_at: string | null;
}

export interface AdminListingsResponse {
  items: AdminListingRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface DocumentPresignedView {
  url: string;
  expires_in_seconds: number;
  filename: string;
  doc_type: string;
  content_type: string;
}

export const admin = {
  docReviewQueue: () => api.get<DocReviewQueue>('/internal/admin/doc-review', { auth: true }),
  approve: (listingId: string, note?: string) =>
    api.post(`/internal/admin/doc-review/${listingId}/approve`, { note }, { auth: true }),
  query: (listingId: string, note: string) =>
    api.post(`/internal/admin/doc-review/${listingId}/query`, { note }, { auth: true }),
  reject: (listingId: string, note: string) =>
    api.post(`/internal/admin/doc-review/${listingId}/reject`, { note }, { auth: true }),
  documentUrl: (listingId: string, documentId: string) =>
    api.get<DocumentPresignedView>(
      `/internal/admin/listings/${listingId}/documents/${documentId}/url`,
      { auth: true },
    ),
  inspectionReviewQueue: () =>
    api.get<InspectionReviewQueue>('/internal/admin/inspections/reports', { auth: true }),
  inspectionReport: (reportId: string) =>
    api.get<InspectionReviewDetail>(`/internal/admin/inspections/reports/${reportId}`, {
      auth: true,
    }),
  approveInspection: (reportId: string, note?: string) =>
    api.post(`/internal/admin/inspections/reports/${reportId}/approve`, { note }, { auth: true }),
  queryInspection: (reportId: string, note: string) =>
    api.post(`/internal/admin/inspections/reports/${reportId}/query`, { note }, { auth: true }),
  rejectInspection: (reportId: string, note: string) =>
    api.post(`/internal/admin/inspections/reports/${reportId}/reject`, { note }, { auth: true }),
  getAreaScore: (listingId: string) =>
    api.get<AreaScoreView>(`/internal/admin/listings/${listingId}/area-score`, {
      auth: true,
    }),
  updateAreaScore: (
    listingId: string,
    payload: Partial<Pick<AreaScoreView, 'road_condition' | 'electricity_supply_hours' | 'security' | 'proximity'>>,
  ) =>
    api.post<AreaScoreView>(`/internal/admin/listings/${listingId}/area-score`, payload, {
      auth: true,
    }),
  listListings: (params: {
    status?: ListingStatus[];
    category?: ListingCategory[];
    q?: string;
    page?: number;
    page_size?: number;
  }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue;
      if (Array.isArray(v)) v.forEach((item) => qs.append(k, String(item)));
      else qs.append(k, String(v));
    }
    return api.get<AdminListingsResponse>(`/internal/admin/listings?${qs.toString()}`, {
      auth: true,
    });
  },
  editListing: (
    listingId: string,
    payload: Partial<{
      title: string;
      subtitle: string;
      description: string;
      district: string;
      price: number;
    }>,
  ) => api.patch(`/internal/admin/listings/${listingId}`, payload, { auth: true }),
  suspend: (listingId: string, reason: string) =>
    api.post(`/internal/admin/listings/${listingId}/suspend`, { reason }, { auth: true }),
  restore: (listingId: string) =>
    api.post(`/internal/admin/listings/${listingId}/restore`, undefined, { auth: true }),
  softDelete: (listingId: string) =>
    api.delete(`/internal/admin/listings/${listingId}`, { auth: true }),
};
