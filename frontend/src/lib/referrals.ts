/** Referral endpoint wrappers. */

import { api } from './api';

export type ReferralTier = 'standard' | 'partner';
export type ReferralCodeStatus = 'active' | 'suspended';

export interface MyCodeView {
  code: string;
  share_link: string;
  tier: ReferralTier;
  status: ReferralCodeStatus;
}

export interface AttributionView {
  agreement_id: string;
  code: string;
  applied_at: string;
  sealed: boolean;
}

export type EarningState = 'joined' | 'pending' | 'cleared' | 'paid';
export type PayoutStatus = 'requested' | 'success' | 'failed';

export interface BalancesView {
  total_earned: number;
  available: number;
  pending: number;
  paid: number;
}

export interface ActivityItemView {
  label: string;
  state: EarningState;
  amount: number | null;
  at: string;
}

export interface CashbackItemView {
  amount: number;
  state: string;
  clears_at: string | null;
  at: string;
}

export interface DashboardView {
  code: string;
  share_link: string;
  tier: ReferralTier;
  status: ReferralCodeStatus;
  balances: BalancesView;
  activity: ActivityItemView[];
  cashback: CashbackItemView[];
  min_withdrawal: number;
  can_withdraw: boolean;
}

export interface PayoutView {
  id: string;
  amount: number;
  status: PayoutStatus;
  bank_account_number: string | null;
  failure_reason: string | null;
  created_at: string;
  settled_at: string | null;
}

/** Read the share-link code captured by /r/[code] (Path A). */
export function readCapturedReferralCode(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)bb_ref=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export const referrals = {
  myCode: () => api.get<MyCodeView>('/referrals/me/code', { auth: true }),

  apply: (agreementId: string, code: string) =>
    api.post<AttributionView>(
      '/referrals/apply',
      { agreement_id: agreementId, code },
      { auth: true },
    ),

  agreementAttribution: (agreementId: string) =>
    api.get<AttributionView | null>(`/referrals/agreement/${agreementId}`, {
      auth: true,
    }),

  dashboard: () => api.get<DashboardView>('/referrals/me/dashboard', { auth: true }),

  withdraw: (bankAccountNumber: string, bankCode: string) =>
    api.post<PayoutView>(
      '/referrals/payouts',
      { bank_account_number: bankAccountNumber, bank_code: bankCode },
      { auth: true },
    ),

  payouts: () => api.get<PayoutView[]>('/referrals/payouts', { auth: true }),
};
