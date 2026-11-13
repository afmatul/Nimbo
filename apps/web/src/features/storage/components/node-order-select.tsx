import { NODE_SORTS, SORT_DIRECTIONS } from '@nimbo/contracts';
import * as React from 'react';

import { Select } from '../../../components/ui/select';
import { orderLabel, sameOrder, type NodeOrder } from '../node-order';

const OPTIONS: readonly NodeOrder[] = NODE_SORTS.flatMap((sort) =>
  SORT_DIRECTIONS.map((dir) => ({ sort, dir })),
);

const keyOf = (option: NodeOrder): string => `${option.sort}-${option.dir}`;

const SELECT_OPTIONS = OPTIONS.map((option) => ({
  value: keyOf(option),
  label: orderLabel(option),
}));

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
  const current = OPTIONS.find((option) => sameOrder(option, order));
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <label htmlFor={id}>Ordenar</label>
      <Select
        id={id}
        value={current === undefined ? '' : keyOf(current)}
        disabled={busy}
        className="h-8 text-xs"
        options={SELECT_OPTIONS}
        onValueChange={(value) => {
          const next = OPTIONS.find((option) => keyOf(option) === value);
          if (next !== undefined) onChange(next);
        }}
      />
    </div>
  );
}
