'use client';

/**
 * Paystack return page. After the hosted checkout, Paystack redirects the payer
 * here with `?reference=…&trxref=…`. We verify that reference against the
 * backend (which also reconciles the charge as a webhook-independent safety net)
 * and show one of three definitive states — confirmed / still processing / not
 * completed — so the payer never lands on an ambiguous screen.
 */

import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { payments, type PaymentStatus } from '@/lib/payments';

// Paystack usually beats the payer back here, but a charge can still be settling
// (or the webhook mid-flight). Poll a few times before we call it "pending".
const MAX_POLLS = 5;
const POLL_INTERVAL_MS = 2500;

type View = PaymentStatus | 'loading' | 'missing';

function PaymentCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const reference = params.get('reference') ?? params.get('trxref');

  const [view, setView] = useState<View>('loading');
  const [continuePath, setContinuePath] = useState<string | null>(null);
  const pollsRef = useRef(0);

  const check = useCallback(async () => {
    if (!reference) {
      setView('missing');
      return;
    }
    try {
      const result = await payments.verify(reference);
      if (result.status === 'pending' && pollsRef.current < MAX_POLLS) {
        pollsRef.current += 1;
        setView('loading');
        setTimeout(() => void check(), POLL_INTERVAL_MS);
        return;
      }
      setView(result.status);
      setContinuePath(result.continue_path);
    } catch {
      // Transient network error — keep waiting and retry a bounded number of times.
      if (pollsRef.current < MAX_POLLS) {
        pollsRef.current += 1;
        setView('loading');
        setTimeout(() => void check(), POLL_INTERVAL_MS);
      } else {
        setView('pending');
      }
    }
  }, [reference]);

  useEffect(() => {
    void check();
  }, [check]);

  function goContinue() {
    router.push((continuePath ?? '/dashboard/seeker') as Route);
  }

  if (view === 'loading') {
    return (
      <Shell>
        <Loader2 className="h-10 w-10 animate-spin text-brand" aria-hidden />
        <h1 className="text-lg font-semibold text-slate-900">Confirming your payment…</h1>
        <p className="text-sm text-slate-600">This only takes a moment.</p>
      </Shell>
    );
  }

  if (view === 'success') {
    return (
      <Shell>
        <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden />
        <h1 className="text-lg font-semibold text-slate-900">Payment confirmed</h1>
        <p className="text-sm text-slate-600">
          Thank you — your payment went through. You&apos;re all set.
        </p>
        <Button className="w-full" onClick={goContinue}>
          Continue
        </Button>
      </Shell>
    );
  }

  if (view === 'failed') {
    return (
      <Shell>
        <XCircle className="h-12 w-12 text-red-500" aria-hidden />
        <h1 className="text-lg font-semibold text-slate-900">Payment not completed</h1>
        <p className="text-sm text-slate-600">
          You have not been charged. You can try again from your dashboard.
        </p>
        <Button
          className="w-full"
          onClick={() => router.push('/dashboard/seeker' as Route)}
        >
          Back to dashboard
        </Button>
      </Shell>
    );
  }

  // pending / missing — the charge may still be settling, or we never got a ref.
  return (
    <Shell>
      <Clock className="h-12 w-12 text-amber-500" aria-hidden />
      <h1 className="text-lg font-semibold text-slate-900">
        {view === 'missing' ? 'No payment to confirm' : 'Still processing'}
      </h1>
      <p className="text-sm text-slate-600">
        {view === 'missing'
          ? "We couldn't find a payment reference. If you just paid, your dashboard will update once it clears."
          : "We're still confirming your payment. It can take a moment — your dashboard will update automatically once it clears."}
      </p>
      <Button
        className="w-full"
        variant="secondary"
        onClick={() => router.push('/dashboard/seeker' as Route)}
      >
        Go to dashboard
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center">
        {children}
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      }
    >
      <PaymentCallback />
    </Suspense>
  );
}
