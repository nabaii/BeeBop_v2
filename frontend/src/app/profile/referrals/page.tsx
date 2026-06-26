'use client';

/**
 * Referrals dashboard (spec §6) — the primary surface that makes the programme
 * feel real: the user's code + share actions, balances, the withdrawal flow
 * (§7), the activity feed (§6.2), and the user's own cashback (§6.3).
 */

import {
  Check,
  Copy,
  Gift,
  Loader2,
  MessageCircle,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Price } from '@/components/ui/price';
import { ApiError } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import {
  referrals,
  type DashboardView,
  type PayoutView,
} from '@/lib/referrals';

// A short, curated list keeps the withdrawal flow usable without a full bank
// directory. Codes are Paystack NIP bank codes.
const BANKS: ReadonlyArray<{ code: string; name: string }> = [
  { code: '044', name: 'Access Bank' },
  { code: '058', name: 'GTBank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '033', name: 'UBA' },
  { code: '011', name: 'First Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '50211', name: 'Kuda' },
  { code: '50515', name: 'Moniepoint' },
  { code: '999992', name: 'OPay' },
  { code: '999991', name: 'PalmPay' },
];

function shareMessage(link: string): string {
  return `Find student accommodation on Beebop — and we both earn when you book. Use my link: ${link}`;
}

export default function ReferralsDashboardPage() {
  const [data, setData] = useState<DashboardView | null>(null);
  const [payouts, setPayouts] = useState<PayoutView[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([referrals.dashboard(), referrals.payouts()])
      .then(([d, p]) => {
        if (cancelled) return;
        setData(d);
        setPayouts(p);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.message : 'Could not load your referrals.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyLink() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.share_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the link is visible to copy manually.
    }
  }

  function refresh() {
    Promise.all([referrals.dashboard(), referrals.payouts()])
      .then(([d, p]) => {
        setData(d);
        setPayouts(p);
      })
      .catch(() => undefined);
  }

  if (loadError) {
    return (
      <div className="p-4">
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }

  const { balances } = data;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
    shareMessage(data.share_link),
  )}`;
  const hasActivity = data.activity.length > 0;
  const lifetimeEmpty =
    balances.total_earned === 0 && !hasActivity && data.cashback.length === 0;

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-brand" aria-hidden />
        <h1 className="text-lg font-semibold text-slate-900">Refer & earn</h1>
        {data.tier === 'partner' && (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
            Campus partner
          </span>
        )}
      </div>

      {/* Code + share (§6.1) */}
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Your referral code
        </p>
        <p className="text-2xl font-bold tracking-wide text-slate-900">{data.code}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={copyLink}
            className="flex-1"
            aria-label="Copy share link"
          >
            {copied ? (
              <Check className="mr-2 h-4 w-4" aria-hidden />
            ) : (
              <Copy className="mr-2 h-4 w-4" aria-hidden />
            )}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button className="w-full">
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
              Share on WhatsApp
            </Button>
          </a>
        </div>
        <p className="break-all text-xs text-slate-400">{data.share_link}</p>
      </section>

      {/* Balances (§6.1) */}
      <section className="grid grid-cols-2 gap-3">
        <BalanceCard label="Available" value={balances.available} emphasis />
        <BalanceCard label="Pending" value={balances.pending} />
        <BalanceCard label="Total earned" value={balances.total_earned} />
        <BalanceCard label="Paid out" value={balances.paid} />
      </section>

      {/* Withdraw (§7) */}
      <WithdrawCard data={data} onDone={refresh} />

      {payouts.length > 0 && <PayoutHistory payouts={payouts} />}

      {/* Activity feed (§6.2) */}
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Activity</h2>
        {hasActivity ? (
          <ul className="divide-y divide-slate-100">
            {data.activity.map((a, i) => (
              <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-slate-700">{a.label}</span>
                <StatePill state={a.state} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState lifetimeEmpty={lifetimeEmpty} />
        )}
      </section>

      {/* Cashback (§6.3) */}
      {data.cashback.length > 0 && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Your cashback</h2>
          <ul className="divide-y divide-slate-100">
            {data.cashback.map((c, i) => (
              <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium text-slate-800">
                  <Price value={c.amount} />
                </span>
                <StatePill state={c.state} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BalanceCard({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? 'rounded-xl border border-brand/30 bg-brand/5 p-3'
          : 'rounded-xl border border-slate-200 bg-white p-3'
      }
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">
        <Price value={value} />
      </p>
    </div>
  );
}

function StatePill({ state }: { state: string }) {
  const styles: Record<string, string> = {
    joined: 'bg-slate-100 text-slate-600',
    pending: 'bg-amber-100 text-amber-700',
    cleared: 'bg-emerald-100 text-emerald-700',
    paid: 'bg-brand/10 text-brand',
  };
  const labels: Record<string, string> = {
    joined: 'Joined',
    pending: 'Pending',
    cleared: 'Available',
    paid: 'Paid',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        styles[state] ?? 'bg-slate-100 text-slate-600'
      }`}
    >
      {labels[state] ?? state}
    </span>
  );
}

function EmptyState({ lifetimeEmpty }: { lifetimeEmpty: boolean }) {
  return (
    <div className="py-4 text-sm text-slate-600">
      {lifetimeEmpty ? (
        <p>
          Share your code with friends looking for accommodation — when they book,
          you both earn. Your earnings will show up here.
        </p>
      ) : (
        <p>No referral activity yet.</p>
      )}
    </div>
  );
}

function WithdrawCard({
  data,
  onDone,
}: {
  data: DashboardView;
  onDone: () => void;
}) {
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState(BANKS[0].code);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PayoutView | null>(null);

  const canWithdraw = data.can_withdraw;

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const payout = await referrals.withdraw(accountNumber.trim(), bankCode);
      setResult(payout);
      if (payout.status !== 'failed') {
        setAccountNumber('');
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the payout.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-slate-500" aria-hidden />
        <h2 className="text-base font-semibold text-slate-900">Withdraw</h2>
      </div>

      {!canWithdraw ? (
        <p className="text-sm text-slate-600">
          You can withdraw once your available balance reaches{' '}
          <strong>{formatNaira(data.min_withdrawal)}</strong>. Earnings become
          available after the booking&apos;s clearing window.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Withdraw your available <Price value={data.balances.available} /> to a
            bank account.
          </p>
          <div className="space-y-2">
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 sm:text-sm"
            >
              {BANKS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
            <Input
              value={accountNumber}
              onChange={(e) =>
                setAccountNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))
              }
              placeholder="Account number"
              inputMode="numeric"
            />
            <Button
              onClick={submit}
              disabled={busy || accountNumber.length < 10}
              className="w-full"
            >
              {busy ? 'Processing…' : `Withdraw ${formatNaira(data.balances.available)}`}
            </Button>
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && result.status !== 'failed' && (
        <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">
          Payout of <Price value={result.amount} /> is on its way to your account.
        </p>
      )}
      {result && result.status === 'failed' && (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {result.failure_reason ?? 'That payout failed.'} Your balance is unchanged
          — please try again.
        </p>
      )}
    </section>
  );
}

function PayoutHistory({ payouts }: { payouts: PayoutView[] }) {
  const styles: Record<string, string> = {
    success: 'bg-emerald-100 text-emerald-700',
    requested: 'bg-amber-100 text-amber-700',
    failed: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    success: 'Paid',
    requested: 'Processing',
    failed: 'Failed',
  };
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Payout history</h2>
      <ul className="divide-y divide-slate-100">
        {payouts.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-slate-700">
              <Price value={p.amount} />
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                styles[p.status] ?? 'bg-slate-100 text-slate-600'
              }`}
            >
              {labels[p.status] ?? p.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
