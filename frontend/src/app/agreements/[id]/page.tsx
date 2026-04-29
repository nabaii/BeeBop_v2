'use client';

/**
 * Agreement detail page — wires the OTP-confirmed sign flow and the PDF
 * download. Sales agreements show the invoice + due-by until payment is
 * confirmed, then unlock the download.
 */

import Link from 'next/link';
import { use, useEffect, useState } from 'react';

import { RouteGuard } from '@/components/route-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { agreements, type AgreementView } from '@/lib/agreements';
import { useSession } from '@/stores/session';

export default function AgreementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RouteGuard roles={['seeker', 'landlord', 'agent']}>
      <Inner id={id} />
    </RouteGuard>
  );
}

function Inner({ id }: { id: string }) {
  const user = useSession((s) => s.user);
  const [agreement, setAgreement] = useState<AgreementView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setAgreement(await agreements.detail(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load agreement.');
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <main className="p-6 text-sm text-red-600">{error}</main>;
  if (!agreement || !user)
    return <main className="p-6 text-sm text-slate-500">Loading…</main>;

  const myParty: 'landlord' | 'seeker' | null =
    user.id === agreement.landlord_id
      ? 'landlord'
      : user.id === agreement.seeker_id
        ? 'seeker'
        : null;

  const alreadySigned = agreement.signatures.some((s) => s.party === myParty);
  const canSign =
    myParty !== null &&
    !alreadySigned &&
    (agreement.status === 'draft' || agreement.status === 'partial_signed');

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <Link href="/dashboard/seeker" className="text-xs text-slate-500 hover:underline">
        ← Back to dashboard
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">
          {agreement.type === 'tenancy' ? 'Tenancy agreement' : 'Sale memorandum'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{agreement.listing_title}</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <dl className="grid grid-cols-2 gap-3">
          <Field label={agreement.type === 'tenancy' ? 'Landlord' : 'Seller'} value={agreement.landlord_name} />
          <Field label={agreement.type === 'tenancy' ? 'Tenant' : 'Buyer'} value={agreement.seeker_name} />
          <Field label="Price" value={`₦${Math.round(agreement.price).toLocaleString('en-NG')}`} />
          {agreement.start_date && <Field label="Effective from" value={agreement.start_date} />}
          {agreement.end_date && <Field label="Term ends" value={agreement.end_date} />}
          {agreement.conditions && <Field label="Conditions" value={agreement.conditions} />}
        </dl>
      </section>

      <SignaturesCard agreement={agreement} />

      {canSign && <SignCard agreementId={agreement.id} onSigned={refresh} />}

      {agreement.status === 'pending_payment' && (
        <PaymentCard agreement={agreement} viewerParty={myParty} />
      )}

      {agreement.pdf_available && (
        <DownloadCard agreementId={agreement.id} status={agreement.status} category={agreement.listing_category} />
      )}
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}

function SignaturesCard({ agreement }: { agreement: AgreementView }) {
  const both = agreement.signatures.length;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="text-base font-semibold text-slate-900">Signatures ({both} / 2)</h2>
      <ul className="mt-2 space-y-1.5">
        {agreement.signatures.map((s) => (
          <li key={`${s.party}:${s.signed_at}`} className="text-slate-700">
            ✓ <span className="capitalize">{s.party}</span> signed via {s.channel} ·{' '}
            {new Date(s.signed_at).toLocaleString('en-NG')}
          </li>
        ))}
        {Array.from({ length: 2 - agreement.signatures.length }).map((_, i) => (
          <li key={`pending-${i}`} className="text-slate-400">
            ○ Awaiting signature
          </li>
        ))}
      </ul>
    </section>
  );
}

function SignCard({
  agreementId,
  onSigned,
}: {
  agreementId: string;
  onSigned: () => Promise<void>;
}) {
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'request' | 'sign' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);

  async function requestCode() {
    setBusy('request');
    setError(null);
    try {
      await agreements.requestOtp(agreementId, channel);
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send code.');
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    setBusy('sign');
    setError(null);
    try {
      await agreements.sign(agreementId, { channel, code });
      await onSigned();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Signature failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-brand/40 bg-brand/5 p-4">
      <h2 className="text-base font-semibold text-slate-900">Sign</h2>
      <div className="flex gap-2">
        <Button
          variant={channel === 'email' ? 'primary' : 'secondary'}
          onClick={() => {
            setChannel('email');
            setOtpSent(false);
          }}
        >
          Sign via email
        </Button>
        <Button
          variant={channel === 'whatsapp' ? 'primary' : 'secondary'}
          onClick={() => {
            setChannel('whatsapp');
            setOtpSent(false);
          }}
        >
          Sign via WhatsApp
        </Button>
      </div>
      {!otpSent ? (
        <Button onClick={() => void requestCode()} disabled={busy !== null}>
          {busy === 'request' ? 'Sending code…' : 'Send signature code'}
        </Button>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Enter the 6-digit code we sent via {channel}.
          </p>
          <Input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <div className="flex gap-2">
            <Button onClick={() => void sign()} disabled={busy !== null || code.length !== 6}>
              {busy === 'sign' ? 'Signing…' : 'Sign agreement'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void requestCode()}
              disabled={busy !== null}
            >
              Resend
            </Button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

function PaymentCard({
  agreement,
  viewerParty,
}: {
  agreement: AgreementView;
  viewerParty: 'landlord' | 'seeker' | null;
}) {
  const isSale = agreement.listing_category === 'sales';
  return (
    <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <h2 className="text-base font-semibold text-slate-900">Payment</h2>
      {isSale ? (
        <>
          <p>
            Sales facilitation invoice issued to the seller. The signed PDF unlocks
            once the invoice is paid.
          </p>
          {agreement.sales_invoice_due_at && (
            <p className="text-xs">
              Due by {new Date(agreement.sales_invoice_due_at).toLocaleString('en-NG')}
            </p>
          )}
        </>
      ) : (
        <>
          {viewerParty === 'landlord' && agreement.landlord_fee_total != null && (
            <p>
              You will be charged{' '}
              <strong>₦{Math.round(agreement.landlord_fee_total).toLocaleString('en-NG')}</strong>{' '}
              via Paystack.
            </p>
          )}
          {viewerParty === 'seeker' && agreement.seeker_fee_total != null && (
            <p>
              You will be charged{' '}
              <strong>₦{Math.round(agreement.seeker_fee_total).toLocaleString('en-NG')}</strong>{' '}
              via Paystack.
            </p>
          )}
          <p className="text-xs">
            Both fees confirmed → agreement becomes active and the listing is marked Let agreed.
          </p>
        </>
      )}
    </section>
  );
}

function DownloadCard({
  agreementId,
  status,
  category,
}: {
  agreementId: string;
  status: AgreementView['status'];
  category: AgreementView['listing_category'];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blockedForSales =
    category === 'sales' && status === 'pending_payment';
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="text-base font-semibold text-slate-900">Download PDF</h2>
      {blockedForSales ? (
        <p className="mt-2 text-sm text-slate-600">
          The signed PDF unlocks once the sales facilitation invoice is paid.
        </p>
      ) : (
        <Button
          className="mt-2"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const { url } = await agreements.download(agreementId);
              window.open(url, '_blank');
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Download failed.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Generating link…' : 'Open PDF'}
        </Button>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
