import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const base =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-slate-900 hover:bg-brand-600',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:text-slate-900',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = 'primary', ...rest },
  ref,
) {
  return <button ref={ref} className={cn(base, variants[variant], className)} {...rest} />;
});
