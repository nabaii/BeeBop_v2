import type { ReactNode } from 'react';

import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { RouteGuard } from '@/components/route-guard';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard roles={['seeker', 'landlord', 'agent']}>
      <div className="flex min-h-screen bg-slate-50">
        <DashboardSidebar />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </RouteGuard>
  );
}
