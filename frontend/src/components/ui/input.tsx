import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'min-h-11 w-full rounded-lg border px-3 py-2 text-base outline-none transition-colors sm:text-sm',
        'placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20',
        invalid ? 'border-red-500' : 'border-slate-300',
        className,
      )}
      {...rest}
    />
  );
});
