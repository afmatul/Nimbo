'use client';

import { useEffect, useRef, type JSX } from 'react';

import { PlanPicker, type CatalogPlan } from './plan-picker';

/**
 * Paso «Plan» del registro: los planes del catálogo (`GET /billing/plans`) con Personal preseleccionado (o el que trajo
 * `?plan=`). Un plan de pago se paga al iniciar sesión por primera vez. El título recibe el foco al llegar.
 */
export function RegisterPlanStep({
  plans,
  planId,
  onChange,
}: {
  readonly plans: readonly CatalogPlan[];
  readonly planId: string | undefined;
  readonly onChange: (planId: string) => void;
}): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="rounded-sm text-lg font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Elige tu plan
        </h2>
        <p className="text-sm text-secondary-foreground">
          Personal es gratuito. Si eliges un plan de pago, lo pagarás al iniciar sesión por primera
          vez.
        </p>
      </div>
      <PlanPicker plans={plans} value={planId} onChange={onChange} />
    </div>
  );
}
