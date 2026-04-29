import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-brand">BeeBop</div>
          <p className="mt-1 text-sm text-slate-500">Verified homes in Abuja</p>
        </div>
        {children}
      </div>
    </main>
  );
}
