/** Typed wrappers for the visit queue. */

import { api } from './api';
import type { ListingCategory } from './listings';

export type VisitStatus =
  | 'pending_assignment'
  | 'agent_assigned'
  | 'scheduled'
  | 'completed'
  | 'cancelled';

export interface VisitQueueRow {
  visit_id: string;
  listing_id: string;
  listing_title: string;
  listing_category: ListingCategory;
  district: string | null;
  seeker_id: string;
  seeker_first_name: string | null;
  offer_id: string | null;
  status: VisitStatus;
  created_at: string;
  assigned_at: string | null;
  agent_confirmation_deadline: string | null;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
}

export interface AvailableAgent {
  id: string;
  name: string;
  operating_area: string | null;
}

export const visits = {
  // Landlord read-only
  forListing: (listingId: string) =>
    api.get<VisitQueueRow[]>(`/visits/listing/${listingId}`, { auth: true }),

  // Admin
  adminQueue: () => api.get<VisitQueueRow[]>('/internal/admin/visits', { auth: true }),
  availableAgents: (visitId: string) =>
    api.get<AvailableAgent[]>(`/internal/admin/visits/${visitId}/available-agents`, {
      auth: true,
    }),
  assignAgent: (visitId: string, agentId: string) =>
    api.post<VisitQueueRow>(
      `/internal/admin/visits/${visitId}/assign`,
      { agent_id: agentId },
      { auth: true },
    ),
};
