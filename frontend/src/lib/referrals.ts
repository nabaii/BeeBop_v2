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
};
