import type { ReactNode } from 'react';

import { RouteGuard } from '@/components/route-guard';

/**
 * Trusted-agent portal — gated to TRUSTED_AGENT only. The parent
 * `/internal/layout.tsx` allows admin + trusted_agent; this child layout
 * tightens to the agent role.
 */
export default function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard roles={['trusted_agent']}>
      <div className="min-h-screen bg-slate-50">{children}</div>
    </RouteGuard>
  );
}
