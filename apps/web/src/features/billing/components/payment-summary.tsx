import { breakdown, formatGtq, type Plan } from '@nimbo/contracts';
import type { JSX } from 'react';

import { Card } from '../../../components/ui/card';
import { formatCount, formatPlanBytes } from '../../../lib/format-plan';

/** «● Plan Equipo · mensual» y sus límites (mockup de pago). */
function PlanLines({ plan }: { readonly plan: Plan }): JSX.Element {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
          Plan {plan.name}
        </h2>
        <span className="text-xs text-muted-foreground">mensual</span>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-foreground">
        <li>{formatPlanBytes(plan.quotaBytes)} de almacenamiento</li>
        <li>{formatPlanBytes(plan.maxFileBytes)} por archivo</li>
        <li>{formatCount(plan.retainedVersions)} versiones por archivo</li>
        <li>{formatCount(plan.agentQueriesPerMonth)} consultas al agente al mes</li>
      </ul>
    </>
  );
}

/** El periodo que paga la renovación (010 CA-8, CA-10): fechas y desde cuándo corre. */
export interface PeriodNote {
  readonly range: string;
  readonly note: string;
}

function PeriodBlock({ period }: { readonly period: PeriodNote }): JSX.Element {
  return (
    <div className="rounded-md border-l-4 border-primary bg-muted px-3 py-2">
      <p className="text-xs font-semibold text-secondary-foreground">Periodo nuevo</p>
      <p className="text-sm font-semibold text-foreground">{period.range}</p>
      <p className="text-xs text-secondary-foreground">{period.note}</p>
    </div>
  );
}

/**
 * Resumen del plan que se paga (mockups de pago; 009 RN-2): límites, el periodo nuevo si es una renovación (010) y el
 * desglose con el IVA incluido.
 */
export function PaymentSummary({
  plan,
  period,
}: {
  readonly plan: Plan;
  readonly period?: PeriodNote;
}): JSX.Element {
  const { subtotalCents, vatCents, totalCents } = breakdown(plan.priceCents);
  return (
    <Card className="flex flex-col gap-4 p-5" aria-labelledby="resumen-pago">
      <p
        id="resumen-pago"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Resumen
      </p>
      <PlanLines plan={plan} />
      {period === undefined ? null : <PeriodBlock period={period} />}
      <dl className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
        <AmountRow label="Subtotal" cents={subtotalCents} />
        <AmountRow label="IVA (12 %)" cents={vatCents} />
      </dl>
      <p className="flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold text-foreground">Total hoy</span>
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {formatGtq(totalCents)}
        </span>
      </p>
    </Card>
  );
}

function AmountRow({
  label,
  cents,
}: {
  readonly label: string;
  readonly cents: number;
}): JSX.Element {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{formatGtq(cents)}</dd>
    </div>
  );
}
