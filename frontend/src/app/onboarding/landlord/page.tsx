'use client';

/**
 * Landlord onboarding wizard. Steps:
 *   1. Identity — first name, last name
 *   2. Account type — individual or agency
 *   3a. NIN (individual) — submit 11-digit NIN, NIMC verification with retry
 *       On admin_review flag, user is told the team is reviewing and can
 *       continue (listing creation is allowed; badge issuance gated elsewhere).
 *   3b. CAC (agency) — business name + RC number, CAC verification with
 *       pending-fallback messaging on timeout.
 *   4. Profile — bio, operating area, profile photo (optional).
 *
 * Incremental saves at every step.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import {
  saveAccountType,
  saveIdentity,
  saveProfile,
  verifyCac,
  verifyNin,
} from '@/lib/users';
import { useSession } from '@/stores/session';

type Step = 'identity' | 'accountType' | 'nin' | 'cac' | 'profile';

export default function LandlordOnboardingPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);

  const [step, setStep] = useState<Step>(user?.firstName ? 'accountType' : 'identity');
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [accountType, setAccountType] = useState<'individual' | 'agency' | null>(null);
  const [nin, setNin] = useState('');
  const [ninReviewPending, setNinReviewPending] = useState(false);
  const [cacNumber, setCacNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [cacPending, setCacPending] = useState(false);
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
      setAccountType(choice);
      setStep(choice === 'individual' ? 'nin' : 'cac');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function step3Nin() {
    setError(null);
    setBusy(true);
    try {
      const res = await verifyNin(nin);
      if (res.verified) {
        setStep('profile');
      } else if (res.admin_review) {
        setNinReviewPending(true);
        setStep('profile');
      } else {
        setError('We could not verify that NIN. Please check and try again.');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function step3Cac() {
    setError(null);
    setBusy(true);
    try {
      const res = await verifyCac({
        cac_number: cacNumber.toUpperCase().trim(),
        business_name: businessName.trim(),
      });
      if (res.verified) {
        setStep('profile');
      } else if (res.pending) {
        setCacPending(true);
        setStep('profile');
      } else {
        setError('We could not verify that CAC number. Please check and try again.');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function step4() {
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
        subtitle="We use this in tenancy agreements and in messages to seekers."
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
          <h1 className="text-lg font-semibold text-slate-900">Are you listing as yourself or as an agency?</h1>
          <p className="mt-1 text-sm text-slate-500">
            Individuals verify with NIN (NIMC). Agencies verify with CAC registration.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void step2('individual')}
            className="rounded-lg border border-slate-300 p-4 text-left hover:border-brand hover:bg-brand/5"
          >
            <div className="text-sm font-semibold text-slate-900">Individual</div>
            <div className="text-xs text-slate-500">Verify with your National Identification Number.</div>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void step2('agency')}
            className="rounded-lg border border-slate-300 p-4 text-left hover:border-brand hover:bg-brand/5"
          >
            <div className="text-sm font-semibold text-slate-900">Agency</div>
            <div className="text-xs text-slate-500">Verify with your CAC RC number.</div>
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (step === 'nin') {
    return (
      <Form
        title="Verify your identity"
        subtitle="We check your NIN against NIMC. Your NIN itself is not stored — only the verified status."
        onSubmit={step3Nin}
        busy={busy}
        error={error}
        cta="Verify"
        disabled={nin.length !== 11}
      >
        <Labelled label="NIN (11 digits)">
          <Input
            inputMode="numeric"
            maxLength={11}
            value={nin}
            onChange={(e) => setNin(e.target.value.replace(/\D/g, ''))}
            required
          />
        </Labelled>
      </Form>
    );
  }

  if (step === 'cac') {
    return (
      <Form
        title="Verify your agency"
        subtitle="We check your RC number and business name against the CAC register."
        onSubmit={step3Cac}
        busy={busy}
        error={error}
        cta="Verify"
        disabled={!cacNumber.trim() || !businessName.trim()}
      >
        <Labelled label="Business name">
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
        </Labelled>
        <Labelled label="CAC RC number">
          <Input
            value={cacNumber}
            onChange={(e) => setCacNumber(e.target.value.toUpperCase())}
            placeholder="RC1234567"
            required
          />
        </Labelled>
      </Form>
    );
  }

  return (
    <Form
      title="Your lister profile"
      subtitle="Optional — but adding a bio and a photo makes seekers more likely to engage."
      onSubmit={step4}
      busy={busy}
      error={error}
      cta="Finish"
      disabled={false}
    >
      {ninReviewPending && (
        <Notice>
          Your NIN is with our team for manual review. You can still create listings — the document badge will be issued once review is complete.
        </Notice>
      )}
      {cacPending && (
        <Notice>
          Your CAC record is pending verification with the registry. You can continue onboarding — we will notify you when verification completes.
        </Notice>
      )}
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
      <p className="text-xs text-slate-500">
        You can add a profile photo from your dashboard after finishing.
      </p>
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
        {busy ? 'Saving…' : cta}
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

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      {children}
    </div>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}
