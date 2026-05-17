import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] items-start justify-center bg-slate-50 px-4 py-6 sm:items-center sm:py-12">
      <div className="w-full max-w-[430px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-brand">BeeBop</div>
          <p className="mt-1 text-sm text-slate-500">Verified homes in Abuja</p>
        </div>
        {children}
      </div>
    </main>
  );
}
