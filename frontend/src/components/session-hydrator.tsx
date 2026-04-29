'use client';

/**
 * Client-only session rehydrator. Mounted once in the root layout so the
 * Zustand store is populated from localStorage before any page reads from it.
 */

import { useEffect } from 'react';

import { useSession } from '@/stores/session';

export function SessionHydrator(): null {
  const hydrate = useSession((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return null;
}
