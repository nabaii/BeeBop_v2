'use client';

/**
 * Share-link capture (Path A, referral spec §3.1).
 *
 * Visiting /r/CODE stores the code in a persistent cookie, then routes the
 * visitor into the normal flow. On registration the code is read back and sent
 * as `referred_by_code`; at checkout it pre-fills the referral field.
 */

import { useRouter } from 'next/navigation';
import { use, useEffect } from 'react';

import { LoadingScreen } from '@/components/ui/loading-screen';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export default function ReferralCapturePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();

  useEffect(() => {
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalized) {
      document.cookie = `bb_ref=${encodeURIComponent(
        normalized,
      )}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    }
    router.replace('/');
  }, [code, router]);

  return <LoadingScreen message="Setting things up…" />;
}
