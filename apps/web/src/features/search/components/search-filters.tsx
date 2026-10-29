'use client';

import { Check, ChevronDown, Info, SlidersHorizontal, X } from 'lucide-react';
import * as React from 'react';

import { Card } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import type { SearchFilters as Filters, TypeOption } from '../search-url';

import { DateSelect, RangeError, RangeFields } from './date-filter';

export interface SearchFiltersProps {
  readonly filters: Filters;
  readonly activeFilters: number;
  readonly invalidRange: boolean;
  readonly onChange: (patch: Partial<Filters>) => void;
  readonly onClear: () => void;
}

const TYPE_LABELS: Readonly<Record<TypeOption, string>> = {
  all: 'Todos',
  documents: 'Documentos',
  images: 'Imágenes',
  other: 'Otros',
};

const SEGMENT_CLASSES = cn(
  'flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 border-b-2 border-transparent px-2.5 text-center text-sm font-medium text-secondary-foreground sm:px-3',
  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
  'peer-checked:border-b-primary peer-checked:bg-accent peer-checked:font-semibold peer-checked:text-foreground',
);

const TYPE_OPTIONS = Object.keys(TYPE_LABELS) as TypeOption[];

/** Un segmento: radio nativo (las flechas las resuelve el navegador), como el filtro de origen de 004. */
function TypeSegment({
  value,
  checked,
  onSelect,
}: {
  readonly value: TypeOption;
  readonly checked: boolean;
  readonly onSelect: (value: TypeOption) => void;
}): React.JSX.Element {
  return (
    <label className="flex min-w-0 flex-1 sm:flex-none">
      <input
        type="radio"
        name="tipo"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="peer sr-only"
      />
      <span className={SEGMENT_CLASSES}>
        {checked ? <Check className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" /> : null}
        {TYPE_LABELS[value]}
      </span>
    </label>
  );
}

/** Tipo = categoría del resumen de espacio (CA-7); con uno elegido, una nota explica que no hay carpetas. */
function TypeFilter({
  type,
  onChange,
}: Pick<SearchFiltersProps, 'onChange'> & { readonly type: TypeOption }): React.JSX.Element {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold text-foreground">Tipo</legend>
      <div className="flex divide-x divide-input overflow-hidden rounded-md border border-input bg-card">
        {TYPE_OPTIONS.map((value) => (
          <TypeSegment
            key={value}
            value={value}
            checked={type === value}
            onSelect={(next) => onChange({ type: next })}
          />
        ))}
      </div>
      {type === 'all' ? null : (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-secondary-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Con un tipo elegido solo ves archivos: las carpetas no tienen tipo.
        </p>
      )}
    </fieldset>
  );
}

function ClearFilters({ onClear }: { readonly onClear: () => void }): React.JSX.Element {
  return (
    <div className="flex justify-end border-t border-border pt-3">
      <button
        type="button"
        onClick={onClear}
        className="inline-flex min-h-6 items-center gap-1.5 text-sm font-medium text-primary-hover underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <X className="h-4 w-4" aria-hidden="true" />
        Quitar filtros
      </button>
    </div>
  );
}

/** Tipo, fecha y, con «Rango personalizado», sus días y el error junto a ellos. */
function FilterFields(props: SearchFiltersProps): React.JSX.Element {
  const { filters, invalidRange, onChange } = props;
  const errorId = React.useId();
  const describedBy = invalidRange ? errorId : undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start lg:gap-6">
        <TypeFilter type={filters.type} onChange={onChange} />
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <DateSelect date={filters.date} onChange={onChange} />
          {filters.date === 'rango' ? (
            <RangeFields filters={filters} onChange={onChange} errorId={describedBy} />
          ) : null}
        </div>
      </div>
      {invalidRange ? <RangeError id={errorId} /> : null}
      {props.activeFilters > 0 ? <ClearFilters onClear={props.onClear} /> : null}
    </div>
  );
}

/** Solo a 360 px: abre y cierra el panel, con el número de filtros activos (observación 1 del mockup). */
function FiltersToggle({
  open,
  count,
  panelId,
  onToggle,
}: {
  readonly open: boolean;
  readonly count: number;
  readonly panelId: string;
  readonly onToggle: () => void;
}): React.JSX.Element {
  const label =
    count === 0 ? 'Filtros' : `Filtros, ${String(count)} ${count === 1 ? 'activo' : 'activos'}`;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={label}
      onClick={onToggle}
      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
    >
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      Filtros
      {count === 0 ? null : (
        <span
          aria-hidden="true"
          className="rounded-full bg-accent px-2 text-xs tabular-nums text-foreground"
        >
          {count}
        </span>
      )}
      <ChevronDown
        className={cn('ml-auto h-4 w-4 motion-safe:transition-transform', open && 'rotate-180')}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * Filtros de la búsqueda (mockup `filtros`, CA-7, CA-8): tipo en segmentos y fecha de modificación con atajos. Se aplican
 * al cambiar. A 360 px van en un panel plegable, cerrado al entrar, para no empujar los resultados.
 */
export function SearchFilters(props: SearchFiltersProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  return (
    <Card role="region" aria-label="Filtros" className="sm:p-5">
      <FiltersToggle
        open={open}
        count={props.activeFilters}
        panelId={panelId}
        onToggle={() => setOpen(!open)}
      />
      <div id={panelId} className={cn(open ? 'block' : 'hidden', 'px-4 pb-4 sm:block sm:p-0')}>
        <FilterFields {...props} />
      </div>
    </Card>
  );
}
