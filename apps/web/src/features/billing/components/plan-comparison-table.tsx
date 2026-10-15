import type { Plan } from '@nimbo/contracts';
import type { ReactNode } from 'react';

import {
  formatCount,
  formatDocxEditing,
  formatMaxEditors,
  formatPlanBytes,
  formatQuetzales,
} from '../../../lib/format-plan';

interface PlanComparisonTableProps {
  readonly plans: readonly Plan[];
}

interface ComparisonRow {
  readonly label: string;
  readonly render: (plan: Plan) => string;
}

/** Filas de CA-2 en su orden. «Historial de versiones con autoría» es copy fijo (RN-3), no una columna de `plan`. */
const COMPARISON_ROWS: readonly ComparisonRow[] = [
  { label: 'Precio mensual', render: (plan) => formatQuetzales(plan.priceCents) },
  { label: 'Almacenamiento', render: (plan) => formatPlanBytes(plan.quotaBytes) },
  { label: 'Tamaño máximo por archivo', render: (plan) => formatPlanBytes(plan.maxFileBytes) },
  { label: 'Edición .docx', render: (plan) => formatDocxEditing(plan.maxEditors) },
  { label: 'Editores simultáneos', render: (plan) => formatMaxEditors(plan.maxEditors) },
  {
    label: 'Consultas al agente',
    render: (plan) => `${formatCount(plan.agentQueriesPerMonth)} / mes`,
  },
  { label: 'Historial de versiones con autoría', render: () => 'Sí' },
  { label: 'Versiones retenidas', render: (plan) => formatCount(plan.retainedVersions) },
  {
    label: 'Retención en papelera',
    render: (plan) => `${formatCount(plan.trashRetentionDays)} días`,
  },
];

function ComparisonHeader({ plans }: PlanComparisonTableProps): ReactNode {
  return (
    <thead>
      <tr className="border-b border-border bg-muted/10">
        <th scope="col" className="p-4 font-medium text-muted-foreground">
          Característica
        </th>
        {plans.map((plan) => (
          <th key={plan.id} scope="col" className="p-4 text-center font-semibold text-foreground">
            {plan.name}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function ComparisonRowView({
  row,
  plans,
}: PlanComparisonTableProps & { readonly row: ComparisonRow }): ReactNode {
  return (
    <tr className="border-b border-border/50 hover:bg-muted/5">
      <th scope="row" className="p-4 text-left font-medium text-muted-foreground">
        {row.label}
      </th>
      {plans.map((plan) => (
        <td key={plan.id} className="p-4 text-center tabular-nums text-foreground">
          {row.render(plan)}
        </td>
      ))}
    </tr>
  );
}

/** Tabla comparativa de CA-2: una columna por plan, con los mismos datos que las tarjetas. */
export function PlanComparisonTable({ plans }: PlanComparisonTableProps): ReactNode {
  return (
    <div className="mt-6 w-full min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-left text-xs">
        <caption className="sr-only">Comparación de planes</caption>
        <ComparisonHeader plans={plans} />
        <tbody>
          {COMPARISON_ROWS.map((row) => (
            <ComparisonRowView key={row.label} row={row} plans={plans} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
