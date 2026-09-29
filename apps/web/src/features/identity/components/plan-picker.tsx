import type { JSX } from 'react';

import { RadioGroup } from '../../../components/ui/radio-group';

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
    <RadioGroup
      name="plan"
      legend="Plan"
      options={plans.map((plan) => ({
        value: plan.id,
        label: `${plan.name} · ${formatPrice(plan.priceCents)}`,
      }))}
      value={selected ?? ''}
      onValueChange={onChange}
    />
  );
}
