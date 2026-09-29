import type { JSX } from 'react';

export interface CatalogPlan {
  readonly id: string;
  readonly name: string;
  readonly priceCents: number;
  readonly free: boolean;
}

function formatPrice(priceCents: number): string {
  return `Q${(priceCents / 100).toFixed(2)}`;
}

const UNAVAILABLE = 'No pudimos cargar los planes; tu cuenta empezará en Personal.';

/** Nombres y precios salen del catálogo. Preselecciona el plan que el catálogo marque como gratuito. */
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
  if (unavailable) {
    return <p className="text-sm text-muted-foreground">{UNAVAILABLE}</p>;
  }

  const selected = value ?? plans.find((plan) => plan.free)?.id;

  return (
    <fieldset className="min-w-0 space-y-2 border-0 p-0">
      <legend className="text-sm font-medium text-foreground">Plan</legend>
      {plans.map((plan) => {
        const inputId = `plan-${plan.id}`;
        return (
          <label
            key={plan.id}
            htmlFor={inputId}
            className="flex min-h-11 items-center gap-3 text-sm"
          >
            <input
              id={inputId}
              type="radio"
              name="plan"
              value={plan.id}
              checked={selected === plan.id}
              onChange={() => onChange?.(plan.id)}
              className="h-5 w-5 border border-input text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span>
              {plan.name} · {formatPrice(plan.priceCents)}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
