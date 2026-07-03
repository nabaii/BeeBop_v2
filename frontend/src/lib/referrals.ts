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

export interface BankOption {
  name: string;
  code: string;
}

export interface ResolvedAccount {
  account_number: string;
  account_name: string;
}

export type PartnerApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface PartnerApplicationView {
  id: string;
  status: PartnerApplicationStatus;
  institution: string;
  position: string;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface PartnerApplicationPayload {
  full_name: string;
  institution: string;
  position: string;
  promo_plan: string;
  contact_phone?: string;
  contact_email?: string;
  payout_bank_code?: string;
  payout_account_number?: string;
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

  banks: () => api.get<BankOption[]>('/referrals/banks', { auth: true }),

  resolveAccount: (accountNumber: string, bankCode: string) =>
    api.post<ResolvedAccount>(
      '/referrals/resolve-account',
      { account_number: accountNumber, bank_code: bankCode },
      { auth: true },
    ),

  withdraw: (bankAccountNumber: string, bankCode: string, accountName?: string) =>
    api.post<PayoutView>(
      '/referrals/payouts',
      {
        bank_account_number: bankAccountNumber,
        bank_code: bankCode,
        account_name: accountName,
      },
      { auth: true },
    ),

  payouts: () => api.get<PayoutView[]>('/referrals/payouts', { auth: true }),

  applyPartner: (payload: PartnerApplicationPayload) =>
    api.post<PartnerApplicationView>('/referrals/partner-application', payload, {
      auth: true,
    }),

  myPartnerApplication: () =>
    api.get<PartnerApplicationView | null>('/referrals/partner-application', {
      auth: true,
    }),
};
