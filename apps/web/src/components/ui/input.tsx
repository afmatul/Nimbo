import * as React from 'react';

import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly error?: boolean;
  readonly errorMessage?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', error = false, errorMessage, disabled, id, ...props }, ref) => {
    const isError = Boolean(error || errorMessage);
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    if (!errorMessage) {
      return (
        <input
          id={id}
          type={type}
          className={cn(
            'flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45',
            isError && 'border-destructive focus-visible:ring-destructive',
            className,
          )}
          ref={ref}
          disabled={disabled}
          aria-invalid={isError ? 'true' : undefined}
          {...props}
        />
      );
    }

    return (
      <div className="w-full space-y-1.5">
        <input
          id={inputId}
          type={type}
          className={cn(
            'flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45',
            'border-destructive focus-visible:ring-destructive',
            className,
          )}
          ref={ref}
          disabled={disabled}
          aria-invalid="true"
          aria-describedby={errorId}
          {...props}
        />
        <p id={errorId} className="text-xs font-medium text-destructive" role="alert">
          {errorMessage}
        </p>
      </div>
    );
  },
);
Input.displayName = 'Input';
