'use client';

/**
 * Landlord onboarding wizard. Identity validation (NIN/CAC) is skipped during
 * the initial test phase so landlords can reach the dashboard and publish
 * live-unverified listings.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { saveAccountType, saveIdentity, saveProfile } from '@/lib/users';
import { useSession } from '@/stores/session';

type Step = 'identity' | 'accountType' | 'profile';

export default function LandlordOnboardingPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);

  const [step, setStep] = useState<Step>(user?.firstName ? 'accountType' : 'identity');
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [bio, setBio] = useState('');
  const [operatingArea, setOperatingArea] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function step1() {
    setError(null);
    setBusy(true);
    try {
      await saveIdentity({ first_name: firstName.trim(), last_name: lastName.trim() });
      setStep('accountType');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function step2(choice: 'individual' | 'agency') {
    setError(null);
    setBusy(true);
    try {
      await saveAccountType(choice);
      setStep('profile');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function step3() {
    setError(null);
    setBusy(true);
    try {
      await saveProfile({
        bio: bio.trim() || undefined,
        operating_area: operatingArea.trim() || undefined,
      });
      router.replace('/dashboard/landlord');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'identity') {
    return (
      <Form
        title="Tell us your name"
        subtitle="We use this in agreements and in messages to seekers."
        onSubmit={step1}
        busy={busy}
        error={error}
        cta="Continue"
        disabled={!firstName.trim() || !lastName.trim()}
      >
        <div className="grid grid-cols-2 gap-3">
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

  if (step === 'accountType') {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-lg font-semibold text-slate-900">
            Are you listing as yourself or as an agency?
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            This helps label your account and route future verification correctly.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void step2('individual')}
            className="rounded-lg border border-slate-300 p-4 text-left hover:border-brand hover:bg-brand/5 disabled:opacity-60"
          >
            <div className="text-sm font-semibold text-slate-900">Individual</div>
            <div className="text-xs text-slate-500">List properties in your personal name.</div>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void step2('agency')}
            className="rounded-lg border border-slate-300 p-4 text-left hover:border-brand hover:bg-brand/5 disabled:opacity-60"
          >
            <div className="text-sm font-semibold text-slate-900">Agency</div>
            <div className="text-xs text-slate-500">
              List properties under an agency or business name.
            </div>
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <Form
      title="Your lister profile"
      subtitle="Optional details that help seekers recognise your operating area."
      onSubmit={step3}
      busy={busy}
      error={error}
      cta="Finish"
      disabled={false}
    >
      <Labelled label="Bio (optional)">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={1000}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
        />
      </Labelled>
      <Labelled label="Operating area (optional)">
        <Input
          value={operatingArea}
          onChange={(e) => setOperatingArea(e.target.value)}
          placeholder="e.g. Wuse 2, Gwarinpa"
        />
      </Labelled>
    </Form>
  );
}

function Form({
  title,
  subtitle,
  onSubmit,
  busy,
  error,
  cta,
  disabled,
  children,
}: {
  title: string;
  subtitle: string;
  onSubmit: () => Promise<void>;
  busy: boolean;
  error: string | null;
  cta: string;
  disabled: boolean;
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
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || disabled}>
        {busy ? 'Saving...' : cta}
      </Button>
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
