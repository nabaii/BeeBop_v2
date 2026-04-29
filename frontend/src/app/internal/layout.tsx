import type { ReactNode } from 'react';

import { RouteGuard } from '@/components/route-guard';

/**
 * Internal portals — admin and trusted agents only. This layout hard-gates
 * access to everyone else so the routes cannot be rendered on the public
 * platform, even briefly, for the wrong role.
 */
export default function InternalLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard roles={['admin', 'trusted_agent']}>
      <div className="min-h-screen bg-slate-100">{children}</div>
    </RouteGuard>
  );
}
