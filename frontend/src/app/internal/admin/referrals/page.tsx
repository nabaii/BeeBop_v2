'use client';

/**
 * Admin referral management (spec §11): metrics, partner-application review,
 * the runtime config editor (no deploy), the code list with suspend/tier +
 * velocity flags, and payout history.
 */

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import {
  referralsAdmin,
  type AdminApplication,
  type AdminCode,
  type AdminOverview,
  type AdminPayout,
  type ReferralConfig,
} from '@/lib/referrals-admin';

export default function ReferralsAdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [codes, setCodes] = useState<AdminCode[]>([]);
  const [payouts, setPayouts] = useState<AdminPayout[]>([]);
  const [config, setConfig] = useState<ReferralConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, a, c, p, cfg] = await Promise.all([
        referralsAdmin.overview(),
        referralsAdmin.applications(),
        referralsAdmin.codes(),
        referralsAdmin.payouts(),
        referralsAdmin.getConfig(),
      ]);
      setOverview(o);
      setApplications(a);
      setCodes(c);
      setPayouts(p);
      setConfig(cfg);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load referral data.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!overview || !config) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  const pending = applications.filter((a) => a.status === 'pending');

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-slate-900">Referral programme</h1>

      <OverviewGrid overview={overview} />

      {pending.length > 0 && <ApplicationsSection applications={pending} onChange={load} />}

      <ConfigEditor config={config} onSaved={load} />

      <CodesTable codes={codes} onChange={load} />

      <PayoutsTable payouts={payouts} />
    </div>
  );
}

function OverviewGrid({ overview }: { overview: AdminOverview }) {
  const tiles: { label: string; value: string }[] = [
    { label: 'Joined via referral', value: String(overview.new_users_via_referral) },
    { label: 'Referred & booked', value: String(overview.referred_users_booked) },
    { label: 'Outstanding (pending)', value: formatNaira(overview.rewards_pending) },
    { label: 'Cleared (owed)', value: formatNaira(overview.rewards_cleared) },
    { label: 'Paid out', value: formatNaira(overview.rewards_paid) },
    { label: 'Reversed', value: formatNaira(overview.rewards_reversed) },
    { label: 'Active codes', value: String(overview.active_codes) },
    { label: 'Partner codes', value: String(overview.partner_codes) },
    { label: 'Suspended', value: String(overview.suspended_codes) },
    { label: 'Pending applications', value: String(overview.pending_applications) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-lg font-semibold text-slate-900">{t.value}</div>
          <div className="mt-0.5 text-caption font-medium uppercase tracking-wide text-slate-500">
            {t.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function ApplicationsSection({
  applications,
  onChange,
}: {
  applications: AdminApplication[];
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, id: string) {
    setBusy(id);
    try {
      await fn();
      await onChange();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">
        Partner applications ({applications.length})
      </h2>
      <ul className="space-y-3">
        {applications.map((a) => (
          <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{a.full_name}</p>
                <p className="text-xs text-slate-500">
                  {a.position} · {a.institution}
                </p>
                <p className="mt-2 text-sm text-slate-700">{a.promo_plan}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {[a.contact_email, a.contact_phone].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  disabled={busy === a.id}
                  onClick={() => void act(() => referralsAdmin.approveApplication(a.id), a.id)}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy === a.id}
                  onClick={() => void act(() => referralsAdmin.rejectApplication(a.id), a.id)}
                >
                  Reject
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Reward fields are stored as fractions but edited as percentages.
const PERCENT_FIELDS: (keyof ReferralConfig)[] = [
  'reward_pool_pct',
  'referrer_share',
  'payer_cashback_share',
  'partner_tier1_share',
  'partner_tier2_share',
  'partner_tier3_share',
];
const PERCENT_LABELS: Record<string, string> = {
  reward_pool_pct: 'Reward pool (% of transaction)',
  referrer_share: 'Referrer share (% of pool)',
  payer_cashback_share: 'Payer cashback (% of pool)',
  partner_tier1_share: 'Partner tier 1 (% of pool)',
  partner_tier2_share: 'Partner tier 2 (% of pool)',
  partner_tier3_share: 'Partner tier 3 (% of pool)',
};
const INT_FIELDS: { key: keyof ReferralConfig; label: string }[] = [
  { key: 'per_code_semester_cap', label: 'Per-code semester cap' },
  { key: 'clearing_window_days', label: 'Clearing window (days)' },
  { key: 'min_withdrawal_naira', label: 'Min withdrawal (₦)' },
  { key: 'partner_tier1_max', label: 'Partner tier 1 max referrals' },
  { key: 'partner_tier2_max', label: 'Partner tier 2 max referrals' },
];

function ConfigEditor({
  config,
  onSaved,
}: {
  config: ReferralConfig;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ReferralConfig>(config);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(config), [config]);

  function setField(key: keyof ReferralConfig, value: number | boolean) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await referralsAdmin.updateConfig(draft);
      setSaved(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save config.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">
        Configuration{' '}
        <span className="text-xs font-normal text-slate-400">— applies without a deploy</span>
      </h2>
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={draft.first_time_purchaser_required}
            onChange={(e) => setField('first_time_purchaser_required', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Require first-time purchaser (relaxed at launch)
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PERCENT_FIELDS.map((key) => (
            <Field key={key} label={PERCENT_LABELS[key]}>
              <Input
                type="number"
                step="0.1"
                value={Math.round((draft[key] as number) * 1000) / 10}
                onChange={(e) => setField(key, (parseFloat(e.target.value) || 0) / 100)}
              />
            </Field>
          ))}
          {INT_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label}>
              <Input
                type="number"
                step="1"
                value={draft[key] as number}
                onChange={(e) => setField(key, parseInt(e.target.value, 10) || 0)}
              />
            </Field>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save configuration'}
          </Button>
          {saved && <span className="text-sm text-emerald-700">Saved.</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
        <p className="text-xs text-slate-400">
          The no-retroactive-attachment rule is locked and not configurable.
        </p>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function CodesTable({ codes, onChange }: { codes: AdminCode[]; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, id: string) {
    setBusy(id);
    try {
      await fn();
      await onChange();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Codes ({codes.length})</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Refs</th>
              <th className="px-3 py-2">Earned</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-mono font-medium text-slate-900">
                  {c.code}
                  {c.velocity_flagged && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-caption font-semibold text-amber-800">
                      ⚑ velocity
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{c.owner_name ?? '—'}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      c.tier === 'partner'
                        ? 'rounded-full bg-brand/10 px-2 py-0.5 text-caption font-semibold text-brand'
                        : 'text-slate-500'
                    }
                  >
                    {c.tier}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">{c.referrals}</td>
                <td className="px-3 py-2 text-slate-600">{formatNaira(c.earned)}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      c.status === 'suspended'
                        ? 'rounded-full bg-red-100 px-2 py-0.5 text-caption font-medium text-red-700'
                        : 'rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-medium text-emerald-800'
                    }
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() =>
                        void act(
                          () =>
                            referralsAdmin.setTier(
                              c.id,
                              c.tier === 'partner' ? 'standard' : 'partner',
                            ),
                          c.id,
                        )
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {c.tier === 'partner' ? 'Make standard' : 'Make partner'}
                    </button>
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() =>
                        void act(
                          () =>
                            c.status === 'suspended'
                              ? referralsAdmin.reactivateCode(c.id)
                              : referralsAdmin.suspendCode(c.id),
                          c.id,
                        )
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {c.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PayoutsTable({ payouts }: { payouts: AdminPayout[] }) {
  if (payouts.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Payouts ({payouts.length})</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium text-slate-900">{formatNaira(p.amount)}</td>
                <td className="px-3 py-2 text-slate-600">{p.bank_account_name ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className="text-slate-600">{p.status}</span>
                  {p.failure_reason && (
                    <span className="ml-1 text-xs text-red-600">· {p.failure_reason}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {new Date(p.created_at).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
