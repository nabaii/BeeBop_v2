/** Agreement endpoint wrappers. */

import { api } from './api';
import type { ListingCategory } from './listings';

export type AgreementStatus =
  | 'draft'
  | 'partial_signed'
  | 'pending_payment'
  | 'signed'
  | 'active'
  | 'expired'
  | 'terminated';

export type AgreementType = 'tenancy' | 'sale';

export interface SignatureRecord {
  party: 'landlord' | 'seeker';
  channel: 'email' | 'whatsapp';
  signed_at: string;
}

export interface AgreementView {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_category: ListingCategory;
  type: AgreementType;
  status: AgreementStatus;
  landlord_id: string;
  landlord_name: string;
  seeker_id: string;
  seeker_name: string;
  price: number;
  start_date: string | null;
  end_date: string | null;
  conditions: string | null;
  signatures: SignatureRecord[];
  pdf_available: boolean;
  sales_invoice_url: string | null;
  sales_invoice_due_at: string | null;
  landlord_fee_total: number | null;
  seeker_fee_total: number | null;
  seller_fee_total: number | null;
  payment_confirmed_at: string | null;
}

export const agreements = {
  listMine: () => api.get<AgreementView[]>('/agreements/mine', { auth: true }),

  detail: (id: string) =>
    api.get<AgreementView>(`/agreements/${id}`, { auth: true }),

  requestOtp: (id: string, channel: 'email' | 'whatsapp') =>
    api.post(`/agreements/${id}/signature/otp`, { channel }, { auth: true }),

  sign: (id: string, payload: { channel: 'email' | 'whatsapp'; code: string }) =>
    api.post<AgreementView>(`/agreements/${id}/signature`, payload, { auth: true }),

  download: (id: string) =>
    api.get<{ url: string; expires_in_seconds: number }>(
      `/agreements/${id}/download`,
      { auth: true },
    ),
};
