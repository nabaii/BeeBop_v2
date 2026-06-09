'use client';

import { Building2, Home, PlusCircle, type LucideIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { landlordOnboardingRoute } from '@/lib/navigation';
import { becomeLandlord } from '@/lib/users';
import { useSession } from '@/stores/session';

interface Props {
  children: ReactNode;
  next: Route;
  intent?: 'dashboard' | 'create';
}

export function LandlordAccessGate({ children, next, intent = 'dashboard' }: Props) {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsOnboarding = user?.role === 'landlord' && !user.onboardingComplete;

  useEffect(() => {
    if (hydrated && needsOnboarding) {
      router.replace(landlordOnboardingRoute(next));
    }
  }, [hydrated, needsOnboarding, next, router]);

  async function startLandlordFlow() {
    setError(null);
    setBusy(true);
    try {
      const updated = await becomeLandlord();
      router.replace(updated.onboarding_complete ? next : landlordOnboardingRoute(next));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start landlord setup.');
      setBusy(false);
    }
  }

  if (!hydrated) return null;

  if (!user) {
    return (
      <AccessPanel
        icon={PlusCircle}
        title="Sign in to list a property"
        body="Use one Beebop account for finding homes and managing your own listings."
      >
        <Link href="/login">
          <Button>Sign in</Button>
        </Link>
        <Link href="/register?role=landlord">
          <Button variant="secondary">Create landlord account</Button>
        </Link>
      </AccessPanel>
    );
  }

  if (user.role === 'landlord' || user.role === 'agent') {
    if (needsOnboarding) {
      return (
        <AccessPanel
          icon={Building2}
          title="Opening landlord setup"
          body="A few account details are needed before listings can be created."
        />
      );
    }
    return <>{children}</>;
  }

  if (user.role === 'seeker') {
    const title =
      intent === 'create' ? 'Start listing on Beebop' : 'Open your landlord portal';
    const body =
      intent === 'create'
        ? 'Switch this signed-in account to landlord mode, finish setup, and create your listing.'
        : 'Switch this signed-in account to landlord mode and manage listings from the dashboard.';
    return (
      <AccessPanel icon={Building2} title={title} body={body} error={error}>
        <Button type="button" onClick={() => void startLandlordFlow()} disabled={busy}>
          {busy ? 'Starting...' : intent === 'create' ? 'Start and create listing' : 'Start landlord setup'}
        </Button>
        <Link href="/">
          <Button variant="secondary">Back to Beebop</Button>
        </Link>
      </AccessPanel>
    );
  }

  return (
    <AccessPanel
      icon={Home}
      title="Use the right portal"
      body="This account role has a separate Beebop workspace."
    >
      <Link href="/">
        <Button variant="secondary">Back to Beebop</Button>
      </Link>
    </AccessPanel>
  );
}

function AccessPanel({
  icon: Icon,
  title,
  body,
  error,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  error?: string | null;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {children && <div className="mt-5 flex flex-col gap-2 sm:flex-row">{children}</div>}
      </section>
    </main>
  );
}
