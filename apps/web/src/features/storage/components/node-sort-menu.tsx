'use client';

import { NODE_SORTS, SORT_DIRECTIONS } from '@nimbo/contracts';
import { ArrowUpDown, ChevronDown, Info, Loader2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { DIRECTION_LABELS, orderLabel, SORT_LABELS, type NodeOrder } from '../node-order';

export interface NodeSortMenuProps {
  /** El orden pedido: lo dice el botón y lo marca el menú. */
  readonly order: NodeOrder;
  /** Se pidió `order` y aún no llega: «Ordenando…» y el menú no abre (CA-12). */
  readonly sorting: boolean;
  readonly onChange: (order: NodeOrder) => void;
}

const SORT_NOTE = 'Las carpetas siempre van primero. El tamaño ordena solo los archivos.';

/**
 * «Ordenar» del explorador (mockup `orden-menu`): un `DropdownMenu` con «Ordenar por» (cuatro campos) y «Orden»
 * (textos según el campo). Elegir un campo conserva la dirección y viceversa.
 */
export function NodeSortMenu({ order, sorting, onChange }: NodeSortMenuProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const label = orderLabel(order);
  return (
    <div className="flex justify-end">
      <DropdownMenu
        modal={false}
        open={open && !sorting}
        onOpenChange={(next) => setOpen(next && !sorting)}
      >
        <SortTrigger label={label} sorting={sorting} />
        <SortMenuContent order={order} onChange={onChange} />
      </DropdownMenu>
      <p role="status" className="sr-only">
        {sorting ? `Ordenando por ${lowerFirst(label)}…` : ''}
      </p>
    </div>
  );
}

function SortMenuContent({
  order,
  onChange,
}: Omit<NodeSortMenuProps, 'sorting'>): React.JSX.Element {
  const fieldId = React.useId();
  const directionId = React.useId();
  const noteId = React.useId();
  return (
    <DropdownMenuContent align="end" aria-describedby={noteId} className="w-72">
      <DropdownMenuLabel id={fieldId}>Ordenar por</DropdownMenuLabel>
      <SortGroup
        labelledBy={fieldId}
        value={order.sort}
        options={NODE_SORTS.map((sort) => ({ value: sort, label: SORT_LABELS[sort] }))}
        onSelect={(sort) => onChange({ ...order, sort })}
      />
      <DropdownMenuSeparator />
      <DropdownMenuLabel id={directionId}>Orden</DropdownMenuLabel>
      <SortGroup
        labelledBy={directionId}
        value={order.dir}
        options={SORT_DIRECTIONS.map((dir) => ({
          value: dir,
          label: DIRECTION_LABELS[order.sort][dir],
        }))}
        onSelect={(dir) => onChange({ ...order, dir })}
      />
      <p
        id={noteId}
        className="m-1 flex items-start gap-2 rounded-md bg-muted px-2.5 py-2 text-xs text-secondary-foreground"
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        {SORT_NOTE}
      </p>
    </DropdownMenuContent>
  );
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** Botón con el orden vigente; mientras llega otro, «Ordenando…» con `aria-disabled` (sigue enfocable). */
function SortTrigger({
  label,
  sorting,
}: {
  readonly label: string;
  readonly sorting: boolean;
}): React.JSX.Element {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-disabled={sorting || undefined}
        className="h-11 w-full justify-between text-foreground aria-disabled:cursor-progress sm:h-9 sm:w-auto sm:justify-start"
      >
        {sorting ? (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          <ArrowUpDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">
          {sorting ? 'Ordenando…' : `Ordenar: ${label}`}
        </span>
        {sorting ? null : (
          <ChevronDown className="h-4 w-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
        )}
      </Button>
    </DropdownMenuTrigger>
  );
}

interface SortGroupProps<T extends string> {
  readonly labelledBy: string;
  readonly value: T;
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly onSelect: (value: T) => void;
}

function SortGroup<T extends string>({
  labelledBy,
  value,
  options,
  onSelect,
}: SortGroupProps<T>): React.JSX.Element {
  const select = (picked: string): void => {
    const option = options.find((candidate) => candidate.value === picked);
    if (option) onSelect(option.value);
  };
  return (
    <DropdownMenuRadioGroup value={value} onValueChange={select} aria-labelledby={labelledBy}>
      {options.map((option) => (
        <DropdownMenuRadioItem key={option.value} value={option.value}>
          {option.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
