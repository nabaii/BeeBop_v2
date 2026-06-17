'use client';

/**
 * Client-only session rehydrator. Mounted once in the root layout so the
 * Zustand store is populated from localStorage before any page reads from it.
 */

import { useEffect } from 'react';

import { ensureFreshSession } from '@/lib/api';
import { useSession } from '@/stores/session';

export function SessionHydrator(): null {
  const hydrate = useSession((s) => s.hydrate);
  useEffect(() => {
    // Hydrate synchronously from localStorage (already drops dead sessions),
    // then — if the access token has lapsed but the refresh token is still
    // valid — refresh once up front so the first page request lands fresh
    // rather than 401-ing, stalling, and bouncing the user to sign-in.
    hydrate();
    // ensureFreshSession is a no-op when the access token is still good, so we
    // can call it unconditionally whenever a session survived hydration.
    if (useSession.getState().refreshToken) {
      void ensureFreshSession();
    }
  }, [hydrate]);
  return null;
}
