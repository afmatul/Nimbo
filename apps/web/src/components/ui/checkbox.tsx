import * as React from 'react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label: ReactNode;
  readonly error?: boolean;
  readonly errorMessage?: string | undefined;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error = false, errorMessage, id, disabled, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const describedBy = errorMessage === undefined ? undefined : `${inputId}-error`;
    const isError = Boolean(error || errorMessage);

    return (
      <div className="w-full space-y-1.5">
        <label
          htmlFor={inputId}
          className="flex min-h-11 items-center gap-3 text-sm font-medium text-foreground"
        >
          <input
            id={inputId}
            ref={ref}
            type="checkbox"
            disabled={disabled}
            aria-invalid={isError ? 'true' : undefined}
            aria-describedby={describedBy}
            className={cn(
              'h-5 w-5 shrink-0 rounded-sm border border-input bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45',
              isError && 'border-destructive focus-visible:ring-destructive',
              className,
            )}
            {...props}
          />
          {label}
        </label>
        {errorMessage === undefined ? null : (
          <p id={describedBy} className="text-xs font-medium text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    );
  },
);
Checkbox.displayName = 'Checkbox';
