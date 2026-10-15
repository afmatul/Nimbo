import { breakdown, formatGtq, type Plan } from '@nimbo/contracts';
import type { JSX } from 'react';

import { Card } from '../../../components/ui/card';
import { formatCount, formatPlanBytes } from '../../../lib/format-plan';

/** Resumen del plan que se contrata (mockup de pago, spec 009 RN-2): límites y desglose con el IVA incluido. */
export function PaymentSummary({ plan }: { readonly plan: Plan }): JSX.Element {
  const { subtotalCents, vatCents, totalCents } = breakdown(plan.priceCents);
  return (
    <Card className="flex flex-col gap-4 p-5" aria-labelledby="resumen-pago">
      <p
        id="resumen-pago"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Resumen
      </p>
      <h2 className="text-base font-semibold text-foreground">Plan {plan.name}</h2>
      <ul className="flex flex-col gap-1 text-sm text-foreground">
        <li>{formatPlanBytes(plan.quotaBytes)} de almacenamiento</li>
        <li>{formatPlanBytes(plan.maxFileBytes)} por archivo</li>
        <li>{formatCount(plan.retainedVersions)} versiones por archivo</li>
        <li>{formatCount(plan.agentQueriesPerMonth)} consultas al agente al mes</li>
      </ul>
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
