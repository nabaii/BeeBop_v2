/** Payment verification wrapper — used by the Paystack return page. */

import { api } from './api';

export type PaymentStatus = 'success' | 'pending' | 'failed';

export interface PaymentVerification {
  reference: string;
  status: PaymentStatus;
  /** What the reference settled, when known — lets the return page deep-link on. */
  kind: 'booking' | 'agreement' | null;
  continue_path: string | null;
}

export const payments = {
  /** Ask the backend for the true status of a charge by its Paystack reference.
   * Public endpoint: works even before the session rehydrates after the
   * external redirect back from Paystack. */
  verify: (reference: string) =>
    api.get<PaymentVerification>(
      `/payments/paystack/verify/${encodeURIComponent(reference)}`,
    ),
};
