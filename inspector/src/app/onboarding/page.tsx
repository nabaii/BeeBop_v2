'use client';

/**
 * Inspector activation flow. Each step is gated — admin sets the basic
 * identity at invite time, but the inspector must add a profile photo,
 * verify NIN, and acknowledge conduct standards before they can access
 * assignments. Status is rechecked after every successful step.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { RouteGuard } from '@/components/route-guard';
import { Button, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { refreshActivationStatus } from '@/lib/auth';
import { inspector, inspectorProfile } from '@/lib/inspector';
import { useSession } from '@/stores/session';

export default function OnboardingPage() {
  return (
    <RouteGuard allowIncompleteActivation>
      <Inner />
    </RouteGuard>
  );
}

function Inner() {
  const router = useRouter();
  const user = useSession((s) => s.user);

  // Once everything's complete, jump to the assignments list.
  useEffect(() => {
    if (user?.activationComplete) router.replace('/assignments');
  }, [user, router]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Activate your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Complete these steps before your first inspection assignment.
        </p>
      </header>

      <NinStep done={user.ninVerified} />
      <PhotoStep done={Boolean(user.profilePhotoUrl)} photoUrl={user.profilePhotoUrl ?? null} />
      <ConductStep done={user.conductAcknowledged} />
    </div>
  );
}

function StepCard({
  title,
  done,
  children,
}: {
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        'rounded-2xl border p-5 ' +
        (done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white')
      }
    >
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {done && (
          <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
            Done
          </span>
        )}
      </header>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function NinStep({ done }: { done: boolean }) {
  const [nin, setNin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await inspectorProfile.verifyNin(nin);
      if (res.verified) {
        await refreshActivationStatus();
      } else if (res.admin_review) {
        setPending(true);
      } else {
        setError('We could not verify that NIN. Check the digits and try again.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard title="Verify your identity" done={done}>
      {done ? (
        <p className="text-sm text-slate-600">Your NIN is verified.</p>
      ) : pending ? (
        <p className="text-sm text-amber-700">
          Your NIN is with the team for manual review. You can continue with the
          remaining steps; we will unlock assignments once review is complete.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            inputMode="numeric"
            maxLength={11}
            value={nin}
            onChange={(e) => setNin(e.target.value.replace(/\D/g, ''))}
            placeholder="11-digit NIN"
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy || nin.length !== 11}>
            {busy ? 'Checking…' : 'Verify NIN'}
          </Button>
        </form>
      )}
    </StepCard>
  );
}

function PhotoStep({ done, photoUrl }: { done: boolean; photoUrl: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const sig = await inspectorProfile.photoUploadSignature();
      let url: string;
      if (sig.cloud_name === 'stub') {
        url = URL.createObjectURL(file);
      } else {
        const form = new FormData();
        form.append('file', file);
        form.append('api_key', sig.api_key);
        form.append('timestamp', String(sig.timestamp));
        form.append('signature', sig.signature);
        form.append('folder', sig.folder);
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`,
          { method: 'POST', body: form },
        );
        if (!res.ok) throw new Error('Upload failed');
        const data = (await res.json()) as { secure_url: string };
        url = data.secure_url;
      }
      await inspectorProfile.setPhoto(url);
      await refreshActivationStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard title="Upload a profile photo" done={done}>
      {done && photoUrl && (
        <img
          src={photoUrl}
          alt="Your inspector profile"
          className="mb-3 h-20 w-20 rounded-full object-cover"
        />
      )}
      <p className="mb-3 text-sm text-slate-600">
        Used to identify you on assignment briefings. Take a clear, head-and-shoulders shot.
      </p>
      <label
        className={
          'inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 ' +
          (busy ? 'pointer-events-none opacity-60' : '')
        }
      >
        {busy ? 'Uploading…' : done ? 'Change photo' : 'Choose photo'}
        <input
          type="file"
          accept="image/*"
          capture="user"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </StepCard>
  );
}

function ConductStep({ done }: { done: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ack() {
    setBusy(true);
    setError(null);
    try {
      await inspector.acknowledgeConduct();
      await refreshActivationStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not acknowledge.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard title="Conduct acknowledgement" done={done}>
      {done ? (
        <p className="text-sm text-slate-600">Acknowledged.</p>
      ) : (
        <>
          <ul className="space-y-2 text-sm text-slate-700">
            <li>• Arrive at the property without the seeker present.</li>
            <li>• Photograph and inspect every room listed in the brief.</li>
            <li>• Never share landlord, agent, or seeker contact details.</li>
            <li>• Submit observations honestly — your report drives the verification badge.</li>
          </ul>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <Button className="mt-4" onClick={() => void ack()} disabled={busy}>
            {busy ? 'Saving…' : 'I acknowledge'}
          </Button>
        </>
      )}
    </StepCard>
  );
}
