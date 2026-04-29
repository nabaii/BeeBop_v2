import type { ReactNode } from 'react';

import { AdminShell } from '@/components/admin/admin-shell';
import { RouteGuard } from '@/components/route-guard';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard roles={['admin']}>
      <AdminShell>{children}</AdminShell>
    </RouteGuard>
  );
}
