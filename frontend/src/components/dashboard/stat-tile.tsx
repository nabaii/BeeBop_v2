import { cn } from '@/lib/cn';

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  emphasis?: boolean;
}

export function StatTile({ label, value, hint, emphasis }: Props) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-4',
        emphasis && 'border-brand/40 bg-brand/5',
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
