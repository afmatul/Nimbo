import type { BackofficeMetricsResponse } from '@nimbo/contracts';
import { Ban, CircleCheck, CirclePause } from 'lucide-react';
import type * as React from 'react';

import { StatusBadge } from '../../../components/nimbo/status-badge';
import { formatCount } from '../../../lib/format-plan';
import { percentText } from '../backoffice-numbers';

type PlanCount = BackofficeMetricsResponse['byPlan'][number];

export interface BarRow {
  readonly key: string;
  readonly name: React.ReactNode;
  readonly count: number;
  /** Plan inactivo: barra neutra (decisión 6). */
  readonly muted?: boolean;
}

export interface BarsTableProps {
  /** Nombre accesible de la tabla («Cuentas por estado: …»). */
  readonly caption: string;
  /** Encabezado de la primera columna y de la del porcentaje. */
  readonly heads: readonly [string, string];
  readonly rows: readonly BarRow[];
  /** Pie: etiqueta del total; el número es la suma de las filas (100 %). */
  readonly totalLabel: string;
}

const HEAD = 'pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground';
const NUMBER = 'w-px whitespace-nowrap pl-4 text-right align-top tabular-nums';

/** Fila: nombre con su barra decorativa (`aria-hidden`; el porcentaje ya está en texto), cuentas y porcentaje. */
function Bar({ row, total }: { readonly row: BarRow; readonly total: number }): React.JSX.Element {
  const width = total === 0 ? 0 : (row.count / total) * 100;
  return (
    <tr className="border-t border-border">
      <th scope="row" className="py-2.5 text-left align-top font-semibold text-foreground">
        <span className="flex flex-wrap items-center gap-1.5">{row.name}</span>
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span
            className={`block h-full rounded-full ${row.muted === true ? 'bg-muted-foreground' : 'bg-primary'}`}
            style={{ width: `${String(width)}%` }}
          />
        </span>
      </th>
      <td className={`${NUMBER} py-2.5 font-semibold text-foreground`}>{formatCount(row.count)}</td>
      <td className={`${NUMBER} py-2.5 text-secondary-foreground`}>
        {percentText(row.count, total)}
      </td>
    </tr>
  );
}

/**
 * Pie: el total de la tabla (la suma de sus filas) es el 100 %; sin filas no hay nada que repartir y se dice «0 %»
 * (revisión I-4), no «100 %» de nada.
 */
function BarsFoot({
  label,
  total,
}: {
  readonly label: string;
  readonly total: number;
}): React.JSX.Element {
  return (
    <tfoot className="border-t border-input font-semibold text-secondary-foreground">
      <tr>
        <th scope="row" className="pt-2.5 text-left">
          {label}
        </th>
        <td className={`${NUMBER} pt-2.5`}>{formatCount(total)}</td>
        <td className={`${NUMBER} pt-2.5`}>{total === 0 ? '0 %' : '100 %'}</td>
      </tr>
    </tfoot>
  );
}

/**
 * El gráfico es la tabla (mockup `backoffice/metricas`, decisión 2): nombre, número y porcentaje en texto, con barras
 * horizontales de un solo tono y pie de total. El dato nunca depende del color ni de la forma (Art. XIII.4).
 */
export function BarsTable({ caption, heads, rows, totalLabel }: BarsTableProps): React.JSX.Element {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <table className="mt-3 w-full border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className={`${HEAD} text-left`}>
            {heads[0]}
          </th>
          <th scope="col" className={`${HEAD} ${NUMBER}`}>
            Cuentas
          </th>
          <th scope="col" className={`${HEAD} ${NUMBER}`}>
            {heads[1]}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Bar key={row.key} row={row} total={total} />
        ))}
      </tbody>
      <BarsFoot label={totalLabel} total={total} />
    </table>
  );
}

/** «Activas» y «Suspendidas» con el mismo `StatusBadge` que la lista de cuentas (decisión 3). */
export function statusRows(byStatus: BackofficeMetricsResponse['accounts']['byStatus']): BarRow[] {
  return [
    {
      key: 'active',
      name: <StatusBadge tone="success" icon={CircleCheck} label="Activas" />,
      count: byStatus.active,
    },
    {
      key: 'suspended',
      name: <StatusBadge tone="destructive" icon={Ban} label="Suspendidas" />,
      count: byStatus.suspended,
    },
  ];
}

function planRow(plan: PlanCount): BarRow {
  const inactive = plan.deactivatedAt !== null;
  const name = inactive ? (
    <>
      {plan.name}
      <StatusBadge tone="neutral" icon={CirclePause} label="Inactivo" />
    </>
  ) : (
    plan.name
  );
  return { key: plan.planId, name, count: plan.clientCount, muted: inactive };
}

/**
 * Planes como los presenta el mockup (decisión 6): primero los activos, en el orden del catálogo en que llegan de la
 * API (por precio), y al final los inactivos que aún tienen cuentas. La API los manda mezclados en ese orden.
 */
export function planRows(byPlan: readonly PlanCount[]): BarRow[] {
  const active = byPlan.filter((plan) => plan.deactivatedAt === null);
  const inactive = byPlan.filter((plan) => plan.deactivatedAt !== null);
  return [...active, ...inactive].map(planRow);
}
