'use client';

/**
 * Seeker onboarding wizard. Three screens:
 *   1. Identity — first name, last name (email optional if registered via WhatsApp)
 *   2. Categories — multi-select: Off-campus, Short-let, Rent, For Sale
 *   3. Student extras (only when Off-campus was selected) — institution, level, gender
 *
 * Each step saves incrementally via PATCH /users/me/* so a dropoff leaves a
 * resumable profile.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import {
  type AgeBand,
  type ListingCategory,
  saveIdentity,
  saveSeekerCategories,
  saveSeekerExtras,
  saveStudentExtras,
} from '@/lib/users';
import { useSession } from '@/stores/session';

type Step = 'identity' | 'categories' | 'student' | 'extras' | 'done';

const CATEGORIES: { value: ListingCategory; label: string; caption: string }[] = [
  { value: 'off_campus', label: 'Off-campus', caption: 'Student accommodation' },
  { value: 'short_let', label: 'Short-let', caption: 'Nightly stays' },
  { value: 'rent', label: 'Rent', caption: 'Long-term tenancy' },
  { value: 'sales', label: 'For sale', caption: 'Property to buy' },
];

const LEVELS = ['100', '200', '300', '400', '500', 'Postgrad'] as const;

const AGE_BANDS: AgeBand[] = ['18-24', '25-34', '35-44', '45-54', '55+'];

const OCCUPATIONS = ['Student', 'Employed', 'Self-employed', 'Business owner', 'Other'] as const;

export default function SeekerOnboardingPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);

  const [step, setStep] = useState<Step>(user?.firstName ? 'categories' : 'identity');
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [selected, setSelected] = useState<ListingCategory[]>([]);
  const [institution, setInstitution] = useState('');
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('100');
  const [gender, setGender] = useState<'female' | 'male'>('female');
  // Optional profile (extras step)
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  const [occupation, setOccupation] = useState<(typeof OCCUPATIONS)[number] | null>(null);
  const [occupationOther, setOccupationOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveStep1() {
    setError(null);
    setBusy(true);
    try {
      await saveIdentity({ first_name: firstName.trim(), last_name: lastName.trim() });
      setStep('categories');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveStep2() {
    setError(null);
    setBusy(true);
    try {
      await saveSeekerCategories(selected);
      // Off-campus seekers fill required student details first; everyone then
      // lands on the optional extras step before the dashboard.
      setStep(selected.includes('off_campus') ? 'student' : 'extras');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveStep3() {
    setError(null);
    setBusy(true);
    try {
      await saveStudentExtras({
        institution: institution.trim(),
        academic_level: level,
        gender,
      });
      setStep('extras');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveExtras() {
    setError(null);
    setBusy(true);
    try {
      const occ =
        occupation === 'Other' ? occupationOther.trim() || null : occupation ?? null;
      await saveSeekerExtras({
        age_band: ageBand,
        occupation: occ,
      });
      router.replace('/dashboard/seeker');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function skipExtras() {
    router.replace('/dashboard/seeker');
  }

  function toggleCategory(c: ListingCategory) {
    setSelected((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  if (step === 'identity') {
    return (
      <Form
        title="Tell us your name"
        subtitle="We use this for formal documents and in messages to landlords."
        onSubmit={saveStep1}
        busy={busy}
        error={error}
        cta="Continue"
        disabled={!firstName.trim() || !lastName.trim()}
      >
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <Labelled label="First name">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </Labelled>
          <Labelled label="Last name">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </Labelled>
        </div>
      </Form>
    );
  }

  if (step === 'categories') {
    return (
      <Form
        title="What are you looking for?"
        subtitle="Pick one or more. You can change these later."
        onSubmit={saveStep2}
        busy={busy}
        error={error}
        cta="Continue"
        disabled={selected.length === 0}
      >
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          {CATEGORIES.map((c) => {
            const active = selected.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleCategory(c.value)}
                className={
                  'rounded-lg border p-3 text-left transition-colors ' +
                  (active
                    ? 'border-brand bg-brand/5 text-brand'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50')
                }
              >
                <div className="text-sm font-semibold">{c.label}</div>
                <div className="text-xs text-slate-500">{c.caption}</div>
              </button>
            );
          })}
        </div>
      </Form>
    );
  }

  if (step === 'student') {
    return (
      <Form
        title="A few student details"
        subtitle="We use these to show you relevant rooms — gender is never shown as a public filter."
        onSubmit={saveStep3}
        busy={busy}
        error={error}
        cta="Finish"
        disabled={!institution.trim()}
      >
        <Labelled label="Institution">
          <Input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="e.g. University of Abuja"
            required
          />
        </Labelled>
        <Labelled label="Academic level">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Gender">
          <div className="flex gap-2">
            {(['female', 'male'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={
                  'flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition-colors ' +
                  (gender === g
                    ? 'border-brand bg-brand/5 text-brand'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50')
                }
              >
                {g}
              </button>
            ))}
          </div>
        </Labelled>
      </Form>
    );
  }

  if (step === 'extras') {
    return (
      <Form
        title="Help us tailor your search"
        subtitle="Optional — this helps us show you better matches. You can skip and add it later."
        onSubmit={saveExtras}
        busy={busy}
        error={error}
        cta="Continue"
        disabled={false}
        onSkip={skipExtras}
      >
        <Labelled label="Age range">
          <div className="flex flex-wrap gap-2">
            {AGE_BANDS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setAgeBand((prev) => (prev === b ? null : b))}
                className={
                  'rounded-lg border px-3 py-2 text-sm transition-colors ' +
                  (ageBand === b
                    ? 'border-brand bg-brand/5 text-brand'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50')
                }
              >
                {b}
              </button>
            ))}
          </div>
        </Labelled>

        <Labelled label="Occupation">
          <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-3">
            {OCCUPATIONS.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOccupation((prev) => (prev === o ? null : o))}
                className={
                  'rounded-lg border px-3 py-2 text-sm transition-colors ' +
                  (occupation === o
                    ? 'border-brand bg-brand/5 text-brand'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50')
                }
              >
                {o}
              </button>
            ))}
          </div>
          {occupation === 'Other' && (
            <Input
              className="mt-2"
              value={occupationOther}
              onChange={(e) => setOccupationOther(e.target.value)}
              placeholder="Tell us your occupation"
              maxLength={100}
            />
          )}
        </Labelled>
      </Form>
    );
  }

  return <p className="text-sm text-slate-500">Redirecting…</p>;
}

function Form({
  title,
  subtitle,
  onSubmit,
  busy,
  error,
  cta,
  disabled,
  onSkip,
  children,
}: {
  title: string;
  subtitle: string;
  onSubmit: () => Promise<void>;
  busy: boolean;
  error: string | null;
  cta: string;
  disabled: boolean;
  onSkip?: () => void;
  children: React.ReactNode;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
    >
      <div>
        <h1 className="font-display text-section font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-body text-slate-500">{subtitle}</p>
      </div>
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || disabled}>
        {busy ? 'Saving…' : cta}
      </Button>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
        >
          Skip for now
        </button>
      )}
    </form>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}
