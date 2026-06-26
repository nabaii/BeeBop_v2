import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { BeebopLockup } from '@/components/brand/beebop-logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center bg-slate-50 px-4 py-6 sm:py-12">
      <div className="mb-4 w-full max-w-[430px]">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Beebop
        </Link>
      </div>
      <div className="flex w-full flex-1 items-start justify-center sm:items-center">
        <div className="w-full max-w-[430px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6 text-center">
            <Link href="/" aria-label="Beebop home" className="inline-block">
              <BeebopLockup size={32} className="justify-center" wordClassName="text-section" />
            </Link>
            <p className="mt-1 text-sm text-slate-500">Verified homes in Abuja</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
