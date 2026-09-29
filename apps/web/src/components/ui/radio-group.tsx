import * as React from 'react';

import { cn } from '../../lib/utils';

export interface RadioOption {
  readonly value: string;
  readonly label: string;
}

export interface RadioGroupProps {
  readonly name: string;
  readonly legend: string;
  readonly options: readonly RadioOption[];
  /** Opción marcada al inicio; después la selección la gestiona el navegador. */
  readonly defaultValue?: string | undefined;
  /** Variante controlada: la opción marcada la decide quien usa el grupo, que recibe cada cambio en `onValueChange`. */
  readonly value?: string | undefined;
  readonly onValueChange?: ((value: string) => void) | undefined;
  readonly error?: boolean;
  readonly errorMessage?: string;
  readonly className?: string;
}

/**
 * Radios nativos con el mismo `name`: las flechas las resuelve el navegador, sin manejador propio. Sin `value` es no
 * controlado (`defaultValue`); con `value`, controlado.
 */
export function RadioGroup({
  name,
  legend,
  options,
  defaultValue,
  value,
  onValueChange,
  error = false,
  errorMessage,
  className,
}: RadioGroupProps): React.JSX.Element {
  const generatedId = React.useId();
  const describedBy = errorMessage === undefined ? undefined : `${generatedId}-error`;
  const isError = Boolean(error || errorMessage);

  return (
    <fieldset
      className={cn('min-w-0 space-y-1.5 border-0 p-0', className)}
      aria-invalid={isError ? 'true' : undefined}
      aria-describedby={describedBy}
    >
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      <div className="space-y-1" role="presentation">
        {options.map((option) => {
          const optionId = `${generatedId}-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className="flex min-h-11 items-center gap-3 text-sm font-medium text-foreground"
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                {...(value === undefined
                  ? { defaultChecked: defaultValue === option.value }
                  : {
                      checked: value === option.value,
                      onChange: () => onValueChange?.(option.value),
                    })}
                aria-invalid={isError ? 'true' : undefined}
                aria-describedby={describedBy}
                className="h-5 w-5 shrink-0 border border-input bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {errorMessage === undefined ? null : (
        <p id={describedBy} className="text-xs font-medium text-destructive">
          {errorMessage}
        </p>
      )}
    </fieldset>
  );
}
