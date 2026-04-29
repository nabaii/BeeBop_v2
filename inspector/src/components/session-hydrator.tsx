'use client';

import { useEffect } from 'react';

import { useSession } from '@/stores/session';

export function SessionHydrator() {
  const hydrate = useSession((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return null;
}
