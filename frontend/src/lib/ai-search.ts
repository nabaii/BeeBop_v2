/**
 * Typed client for the Sprint 13 conversational search endpoints.
 */

import { api } from './api';
import type { ListingCategory } from './listings';

export type ChatIntent = 'search' | 'clarification' | 'information' | 'transactional';
export type VerificationTier = 'fully_verified' | 'doc_verified' | 'unverified';

export interface ExtractedParameters {
  listing_category: ListingCategory | null;
  raw_query: string;
  locations: string[];
  amenities: string[];
  min_price?: number | null;
  max_price?: number | null;
  bedroom_count?: number | null;
  verification_tiers: VerificationTier[];
  duration_years?: number | null;
  urgency?: 'immediate' | 'soon' | 'flexible' | null;
}

export interface ReferenceResolution {
  kind: string;
  index?: number | null;
  amenity?: string | null;
  action_kind?: string | null;
}

export interface ResultListingSummary {
  id: string;
  title: string;
  category: ListingCategory;
  status: string;
  price: number | null;
  price_period?: string | null;
  district: string | null;
  cover_url: string | null;
  secondary_url?: string | null;
  rating: number | null;
  review_count: number;
  bedroom_count?: number | null;
  bathroom_count?: number | null;
  rank_score: number;
  rank_signals: Record<string, unknown>;
}

export interface ChatResponse {
  session_id: string;
  intent: ChatIntent;
  parameters: ExtractedParameters | null;
  missing_parameter_prompt: string | null;
  reference_resolution: ReferenceResolution | null;
  assistant_message: string;
  // The single most useful distinction across the results (e.g. "The first is
  // the only one Beebop has physically verified"), rendered as a styled note
  // beside the cards. Deterministic — never woven into assistant_message.
  result_note: string | null;
  results: ResultListingSummary[];
  used_fallback: boolean;
  prompt_version: string;
  concierge_prompt_version: string | null;
  query_id: string;
}

export function sendChatQuery(args: {
  query: string;
  session_id?: string | null;
}): Promise<ChatResponse> {
  return api.post('/ai-search/chat', args);
}

export async function clearChatSession(sessionId: string): Promise<void> {
  await api.delete<void>(`/ai-search/sessions/${sessionId}`);
}
