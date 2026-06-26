'use client';

/**
 * Campus-partner application (spec §2.2). Course reps / union execs apply for an
 * elevated, tiered earning rate; an admin reviews manually.
 */

import { ArrowLeft } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { referrals, type PartnerApplicationView } from '@/lib/referrals';

export default function PartnerApplicationPage() {
  const [existing, setExisting] = useState<PartnerApplicationView | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    referrals
      .myPartnerApplication()
      .then((a) => !cancelled && setExisting(a))
      .catch(() => !cancelled && setExisting(null));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5 px-4 py-5 pb-8">
      <Link
        href={'/profile/referrals' as Route}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Referrals
      </Link>

      <header>
        <h1 className="text-lg font-semibold text-slate-900">Become a campus partner</h1>
        <p className="mt-1 text-sm text-slate-500">
          Student union leaders and course reps earn at a higher, tiered rate. Tell us how
          you&apos;ll spread the word — we review every application.
        </p>
      </header>

      {existing === undefined ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : existing && existing.status !== 'rejected' ? (
        <StatusCard application={existing} />
      ) : (
        <ApplicationForm previousNote={existing?.review_note ?? null} onSubmitted={setExisting} />
      )}
    </div>
  );
}

function StatusCard({ application }: { application: PartnerApplicationView }) {
  const isApproved = application.status === 'approved';
  return (
    <section
      className={`rounded-2xl border p-4 ${
        isApproved ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <p className="text-sm font-semibold text-slate-900">
        {isApproved ? 'You are a campus partner 🎉' : 'Application under review'}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        {isApproved
          ? 'Your code now earns at the elevated partner rate.'
          : "We'll let you know once an admin has reviewed your application."}
      </p>
      <p className="mt-2 text-xs text-slate-400">
        {application.position} · {application.institution}
      </p>
    </section>
  );
}

function ApplicationForm({
  previousNote,
  onSubmitted,
}: {
  previousNote: string | null;
  onSubmitted: (a: PartnerApplicationView) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [institution, setInstitution] = useState('');
  const [position, setPosition] = useState('');
  const [promoPlan, setPromoPlan] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = fullName.trim() && institution.trim() && position.trim() && promoPlan.trim();

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const application = await referrals.applyPartner({
        full_name: fullName.trim(),
        institution: institution.trim(),
        position: position.trim(),
        promo_plan: promoPlan.trim(),
        contact_phone: phone.trim() || undefined,
      });
      onSubmitted(application);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your application.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      {previousNote && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Your previous application was not approved: {previousNote}
        </p>
      )}
      <Labelled label="Full name">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Labelled>
      <Labelled label="Institution">
        <Input
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          placeholder="e.g. Nile University"
        />
      </Labelled>
      <Labelled label="Position held">
        <Input
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="e.g. Course rep, Union exec"
        />
      </Labelled>
      <Labelled label="How will you promote Beebop?">
        <textarea
          value={promoPlan}
          onChange={(e) => setPromoPlan(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          placeholder="WhatsApp groups, class reps, orientation events…"
        />
      </Labelled>
      <Labelled label="Contact phone (optional)">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      </Labelled>
      <Button onClick={() => void submit()} disabled={busy || !canSubmit}>
        {busy ? 'Submitting…' : 'Submit application'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
