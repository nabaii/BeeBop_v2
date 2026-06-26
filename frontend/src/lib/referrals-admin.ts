/** Admin referral-management endpoint wrappers (§11). Admin-gated server-side. */

import { api } from './api';
import type { PartnerApplicationStatus, PayoutStatus, ReferralTier } from './referrals';

export interface AdminOverview {
  new_users_via_referral: number;
  referred_users_booked: number;
  rewards_pending: number;
  rewards_cleared: number;
  rewards_paid: number;
  rewards_reversed: number;
  active_codes: number;
  partner_codes: number;
  suspended_codes: number;
  pending_applications: number;
}

export interface AdminCode {
  id: string;
  code: string;
  owner_name: string | null;
  tier: ReferralTier;
  status: 'active' | 'suspended';
  referrals: number;
  earned: number;
  velocity_flagged: boolean;
}

export interface AdminApplication {
  id: string;
  user_id: string;
  full_name: string;
  institution: string;
  position: string;
  promo_plan: string;
  contact_phone: string | null;
  contact_email: string | null;
  status: PartnerApplicationStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface AdminPayout {
  id: string;
  user_id: string;
  amount: number;
  status: PayoutStatus;
  bank_account_name: string | null;
  failure_reason: string | null;
  created_at: string;
  settled_at: string | null;
}

export interface ReferralConfig {
  first_time_purchaser_required: boolean;
  per_code_semester_cap: number;
  clearing_window_days: number;
  min_withdrawal_naira: number;
  reward_pool_pct: number;
  referrer_share: number;
  payer_cashback_share: number;
  partner_tier1_share: number;
  partner_tier2_share: number;
  partner_tier3_share: number;
  partner_tier1_max: number;
  partner_tier2_max: number;
}

const base = '/internal/admin/referrals';

export const referralsAdmin = {
  overview: () => api.get<AdminOverview>(`${base}/overview`, { auth: true }),
  codes: () => api.get<AdminCode[]>(`${base}/codes`, { auth: true }),
  applications: () => api.get<AdminApplication[]>(`${base}/applications`, { auth: true }),
  approveApplication: (id: string) =>
    api.post<AdminApplication>(`${base}/applications/${id}/approve`, undefined, { auth: true }),
  rejectApplication: (id: string, note?: string) =>
    api.post<AdminApplication>(`${base}/applications/${id}/reject`, { note }, { auth: true }),
  suspendCode: (id: string) =>
    api.post<{ status: string }>(`${base}/codes/${id}/suspend`, undefined, { auth: true }),
  reactivateCode: (id: string) =>
    api.post<{ status: string }>(`${base}/codes/${id}/reactivate`, undefined, { auth: true }),
  setTier: (id: string, tier: ReferralTier) =>
    api.post<{ tier: string }>(`${base}/codes/${id}/tier`, { tier }, { auth: true }),
  getConfig: () => api.get<ReferralConfig>(`${base}/config`, { auth: true }),
  updateConfig: (changes: Partial<ReferralConfig>) =>
    api.patch<ReferralConfig>(`${base}/config`, changes, { auth: true }),
  payouts: () => api.get<AdminPayout[]>(`${base}/payouts`, { auth: true }),
  reverseEarning: (id: string) =>
    api.post<{ state: string }>(`${base}/earnings/${id}/reverse`, undefined, { auth: true }),
};
