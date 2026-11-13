import { NODE_SORTS, SORT_DIRECTIONS } from '@nimbo/contracts';
import * as React from 'react';

import { orderLabel, sameOrder, type NodeOrder } from '../node-order';

const OPTIONS: readonly NodeOrder[] = NODE_SORTS.flatMap((sort) =>
  SORT_DIRECTIONS.map((dir) => ({ sort, dir })),
);

/** «Ordenar» para las tarjetas, que no tienen encabezados de tabla (007 CA-10); la lista usa los encabezados. */
export function NodeOrderSelect({
  order,
  busy,
  onChange,
}: {
  readonly order: NodeOrder;
  readonly busy: boolean;
  readonly onChange: (order: NodeOrder) => void;
}): React.JSX.Element {
  const id = React.useId();
  const current = OPTIONS.findIndex((option) => sameOrder(option, order));
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <label htmlFor={id}>Ordenar</label>
      <select
        id={id}
        value={current}
        disabled={busy}
        onChange={(event) => {
          const next = OPTIONS[Number(event.target.value)];
          if (next !== undefined) onChange(next);
        }}
        className="min-h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {OPTIONS.map((option, index) => (
          <option key={`${option.sort}-${option.dir}`} value={index}>
            {orderLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}
