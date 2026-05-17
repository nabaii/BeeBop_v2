import type { ReactNode } from 'react';

import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { RouteGuard } from '@/components/route-guard';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard roles={['seeker', 'landlord', 'agent']}>
      <DashboardChrome>{children}</DashboardChrome>
    </RouteGuard>
  );
}
