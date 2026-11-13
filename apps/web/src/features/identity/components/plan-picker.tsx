import { formatGtq, type Plan } from '@nimbo/contracts';
import type { JSX } from 'react';
import { useId } from 'react';

import { PlanCard } from '../../../components/nimbo/plan-card';
import { cn } from '../../../lib/utils';

/** Un plan del catálogo con lo que el registro necesita para decidir: `free` es «cuesta cero». */
export type CatalogPlan = Plan & { readonly free: boolean };

const UNAVAILABLE = 'No pudimos cargar los planes; tu cuenta empezará en Personal.';

/** Texto al pie de la tarjeta: la selección no depende solo del borde (ícono, color y texto, AA). */
function ChoiceLabel({ selected }: { readonly selected: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-9 items-center justify-center rounded-md border text-sm font-medium',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-card text-foreground',
      )}
    >
      {selected ? 'Plan elegido' : 'Elegir plan'}
    </span>
  );
}

function PlanOption({
  plan,
  name,
  selected,
  onChange,
}: {
  readonly plan: CatalogPlan;
  readonly name: string;
  readonly selected: boolean;
  readonly onChange?: ((planId: string) => void) | undefined;
}): JSX.Element {
  const id = `${name}-${plan.id}`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer rounded-lg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2"
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={plan.id}
        checked={selected}
        onChange={() => onChange?.(plan.id)}
        aria-label={`${plan.name} · ${formatGtq(plan.priceCents)}`}
        className="sr-only"
      />
      <PlanCard
        plan={plan}
        headingLevel="h3"
        highlighted={selected}
        className="w-full"
        action={<ChoiceLabel selected={selected} />}
      />
    </label>
  );
}

/**
 * Las tarjetas del catálogo (las de `/planes`, sin la tabla comparativa) como un grupo de radios: nombre, precio y
 * límites salen de la API. Preselecciona el plan gratuito del catálogo; el teclado lo resuelve el navegador.
 */
export function PlanPicker({
  plans,
  unavailable = false,
  value,
  onChange,
}: {
  readonly plans: readonly CatalogPlan[];
  readonly unavailable?: boolean;
  readonly value?: string | undefined;
  readonly onChange?: (planId: string) => void;
}): JSX.Element {
  const name = useId();
  if (unavailable) {
    return <p className="text-sm text-muted-foreground">{UNAVAILABLE}</p>;
  }

  const selected = value ?? plans.find((plan) => plan.free)?.id;

  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="sr-only">Plan</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <PlanOption
            key={plan.id}
            plan={plan}
            name={name}
            selected={plan.id === selected}
            onChange={onChange}
          />
        ))}
      </div>
    </fieldset>
  );
}
