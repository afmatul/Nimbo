import type { NodeSort } from '@nimbo/contracts';
import { ArrowDown, ArrowUp } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../../lib/utils';
import type { NodeOrder } from '../node-order';

/** Orden que muestran las filas y cómo pedir otro desde un encabezado (007 CA-10). */
export interface TableSorting {
  readonly order: NodeOrder;
  readonly onSort: (order: NodeOrder) => void;
}

type SortableColumn = Exclude<NodeSort, 'created'>;

const COLUMN_LABELS: Readonly<Record<SortableColumn, string>> = {
  name: 'Nombre',
  size: 'Tamaño',
  updated: 'Modificado',
};

/** La columna activa invierte la dirección; otra empieza ascendente, el valor por defecto de la API (D-6). */
function nextOrder(column: SortableColumn, order: NodeOrder): NodeOrder {
  if (order.sort !== column) return { sort: column, dir: 'asc' };
  return { sort: column, dir: order.dir === 'asc' ? 'desc' : 'asc' };
}

function ariaSortOf(active: NodeOrder['dir'] | undefined): 'ascending' | 'descending' | undefined {
  if (active === undefined) return undefined;
  return active === 'asc' ? 'ascending' : 'descending';
}

/**
 * Encabezado con botón de orden y `aria-sort` solo en la columna activa. Con el orden por fecha de creación ninguna
 * columna lo lleva: la tabla muestra «Modificado», no la fecha de creación. Sin `sorting` es texto.
 */
export function SortableHeader({
  column,
  className,
  sorting,
}: {
  readonly column: SortableColumn;
  readonly className: string;
  readonly sorting: TableSorting | undefined;
}): React.JSX.Element {
  const label = COLUMN_LABELS[column];
  if (!sorting) {
    return (
      <th scope="col" className={className}>
        {label}
      </th>
    );
  }
  const active = sorting.order.sort === column ? sorting.order.dir : undefined;
  const Arrow = active === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={className} aria-sort={ariaSortOf(active)}>
      <button
        type="button"
        onClick={() => sorting.onSort(nextOrder(column, sorting.order))}
        className={cn(
          'inline-flex min-h-6 items-center gap-1 rounded-sm font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'text-secondary-foreground' : undefined,
        )}
      >
        {label}
        {active ? <Arrow className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : null}
      </button>
    </th>
  );
}
