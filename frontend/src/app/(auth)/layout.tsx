import type { ReactNode } from 'react';

import { BeebopLockup } from '@/components/brand/beebop-logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] items-start justify-center bg-slate-50 px-4 py-6 sm:items-center sm:py-12">
      <div className="w-full max-w-[430px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <BeebopLockup size={32} className="justify-center" wordClassName="text-section" />
          <p className="mt-1 text-sm text-slate-500">Verified homes in Abuja</p>
        </div>
        {children}
      </div>
    </main>
  );
}
