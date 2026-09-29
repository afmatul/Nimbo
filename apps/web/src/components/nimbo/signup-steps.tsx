import { Check } from 'lucide-react';
import type { JSX } from 'react';

import { cn } from '../../lib/utils';

const STEPS = ['Cuenta', 'Verificación', 'Listo'] as const;

export type SignupStep = 1 | 2 | 3;

/** «Listo» es el último paso: al llegar a él, el registro terminó y los tres se ven completados. */
function isDone(step: number, current: SignupStep): boolean {
  return step < current || current === STEPS.length;
}

function StepMarker({
  step,
  done,
  active,
}: {
  readonly step: number;
  readonly done: boolean;
  readonly active: boolean;
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        done && 'bg-success-foreground text-primary-foreground',
        !done && active && 'bg-primary text-primary-foreground',
        !done && !active && 'border border-input bg-card text-muted-foreground',
      )}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : step}
    </span>
  );
}

/** Indicador «1 Cuenta · 2 Verificación · 3 Listo» de las pantallas de registro (mockups de 001). */
export function SignupSteps({ current }: { readonly current: SignupStep }): JSX.Element {
  return (
    <ol aria-label="Pasos del registro" className="flex w-full items-center gap-2 text-sm">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const done = isDone(step, current);
        const active = step === current;
        const last = step === STEPS.length;
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className={cn('flex items-center gap-2', !last && 'flex-1')}
          >
            <StepMarker step={step} done={done} active={active} />
            <span
              className={cn(
                'whitespace-nowrap',
                active ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
              {done ? <span className="sr-only"> (completado)</span> : null}
            </span>
            {last ? null : (
              <span
                aria-hidden="true"
                className={cn('h-px min-w-4 flex-1', step < current ? 'bg-success' : 'bg-border')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
