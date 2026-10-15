import type { Plan } from '@nimbo/contracts';
import type { ReactNode } from 'react';

import { formatDocxEditing, formatPlanBytes, formatQuetzales } from '../../lib/format-plan';
import { cn } from '../../lib/utils';
import { Card } from '../ui/card';

export interface PlanCardProps {
  readonly plan: Plan;
  readonly className?: string;
  /** Acción al pie (009 CA-9: «Contratar» en los planes de pago); la decide la página. */
  readonly action?: ReactNode;
}

/** Tarjeta de un plan del catálogo (008 CA-2, RF-19): nombre, precio y límites salen del contrato, nunca del frontend. */
export function PlanCard({ plan, className, action }: PlanCardProps): ReactNode {
  return (
    <Card className={cn('flex flex-col gap-4 p-5', className)}>
      <h2 className="text-base font-semibold text-foreground">{plan.name}</h2>
      <p className="min-h-8 text-xs text-muted-foreground">{plan.description}</p>
      <p className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {formatQuetzales(plan.priceCents)}
        </span>
        <span className="text-xs text-muted-foreground">al mes</span>
      </p>
      <dl className="flex flex-col gap-2 border-t border-border pt-2 text-xs text-foreground">
        <PlanFact label="Almacenamiento" value={formatPlanBytes(plan.quotaBytes)} />
        <PlanFact label="Archivo máx." value={formatPlanBytes(plan.maxFileBytes)} />
        <PlanFact label="Edición .docx" value={formatDocxEditing(plan.maxEditors)} />
      </dl>
      {action === undefined ? null : <div className="mt-auto pt-2">{action}</div>}
    </Card>
  );
}

function PlanFact({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
