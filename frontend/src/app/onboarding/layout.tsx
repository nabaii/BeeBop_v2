import type { ReactNode } from 'react';

import { RouteGuard } from '@/components/route-guard';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard>
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {children}
        </div>
      </main>
    </RouteGuard>
  );
}
