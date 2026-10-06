'use client';

import { Check, CircleAlert, X } from 'lucide-react';
import * as React from 'react';

import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { cn } from '../../../lib/utils';
import { ORIGIN_FILTER_LABELS } from '../activity-labels';
import type { ActivityFilters as Filters, ActivityOriginFilter } from '../hooks/use-activity';

export interface ActivityFiltersProps {
  readonly filters: Filters;
  readonly invalidRange: boolean;
  /** Muestra «Limpiar filtros»; la vista lo oculta si ya lo ofrece el estado vacío (un solo botón). */
  readonly clearable: boolean;
  /** Lo que anuncia el contador (`role="status"`), p. ej. «Mostrando 9 eventos, …». */
  readonly resultText: string;
  readonly onChange: (patch: Partial<Filters>) => void;
  readonly onClear: () => void;
}

/**
 * El mockup pide «igual o posterior»: un mismo día en «Desde» y «Hasta» es válido. `AUDIT_FIELD_MESSAGES.INVALID_RANGE`
 * de contratos dice solo «posterior» porque compara instantes; la web nunca lo recibe, porque no consulta un rango inválido.
 */
const INVALID_RANGE_MESSAGE =
  'La fecha final debe ser igual o posterior a la inicial. Corrige el rango para ver tu actividad.';

const SEGMENT_CLASSES = cn(
  'flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 border-b-2 border-transparent px-3 text-center text-sm font-medium text-secondary-foreground',
  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
  'peer-checked:border-b-primary peer-checked:bg-accent peer-checked:font-semibold peer-checked:text-foreground',
);

const ORIGIN_OPTIONS = Object.keys(ORIGIN_FILTER_LABELS) as ActivityOriginFilter[];

/** Un segmento: radio nativo (las flechas las resuelve el navegador) con marca de ícono y barra inferior. */
function OriginSegment({
  value,
  checked,
  onSelect,
}: {
  readonly value: ActivityOriginFilter;
  readonly checked: boolean;
  readonly onSelect: (value: ActivityOriginFilter) => void;
}): React.JSX.Element {
  return (
    <label className="flex min-w-0 flex-1 sm:flex-none">
      <input
        type="radio"
        name="origen"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="peer sr-only"
      />
      <span className={SEGMENT_CLASSES}>
        {checked ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
        {ORIGIN_FILTER_LABELS[value]}
      </span>
    </label>
  );
}

function OriginFilter({
  origin,
  onChange,
}: {
  readonly origin: ActivityOriginFilter;
  readonly onChange: ActivityFiltersProps['onChange'];
}): React.JSX.Element {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold text-foreground">Origen</legend>
      <div className="flex divide-x divide-input overflow-hidden rounded-md border border-input bg-card">
        {ORIGIN_OPTIONS.map((value) => (
          <OriginSegment
            key={value}
            value={value}
            checked={origin === value}
            onSelect={(next) => onChange({ origin: next })}
          />
        ))}
      </div>
    </fieldset>
  );
}

function DateField({
  label,
  value,
  errorId,
  onValue,
}: {
  readonly label: string;
  readonly value: string;
  readonly errorId: string | undefined;
  readonly onValue: (day: string) => void;
}): React.JSX.Element {
  const id = React.useId();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={value}
        error={errorId !== undefined}
        aria-describedby={errorId}
        className="tabular-nums"
        onChange={(event) => onValue(event.target.value)}
      />
    </div>
  );
}

function DateFilters({
  filters,
  errorId,
  onChange,
}: {
  readonly filters: Filters;
  readonly errorId: string | undefined;
  readonly onChange: ActivityFiltersProps['onChange'];
}): React.JSX.Element {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold text-foreground">Fechas</legend>
      <div className="flex flex-col gap-3 sm:flex-row">
        <DateField
          label="Desde"
          value={filters.fromDay}
          errorId={errorId}
          onValue={(fromDay) => onChange({ fromDay })}
        />
        <DateField
          label="Hasta"
          value={filters.toDay}
          errorId={errorId}
          onValue={(toDay) => onChange({ toDay })}
        />
      </div>
    </fieldset>
  );
}

function RangeError({ id }: { readonly id: string }): React.JSX.Element {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-sm font-medium text-destructive"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{INVALID_RANGE_MESSAGE}</span>
    </p>
  );
}

function FiltersFooter({
  resultText,
  clearable,
  onClear,
}: Pick<ActivityFiltersProps, 'resultText' | 'clearable' | 'onClear'>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p role="status" className="text-sm text-secondary-foreground">
        {resultText}
      </p>
      {clearable ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-6 items-center gap-1.5 self-start text-sm font-medium text-primary-hover underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:self-auto"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Limpiar filtros
        </button>
      ) : null}
    </div>
  );
}

/**
 * Filtros de «Mi actividad» (mockup `audit/mi-actividad`, CA-10): origen «Todo · Yo · Personal de Nimbo» sin subfiltro,
 * «Desde» y «Hasta» nativos. Se aplican al cambiar, sin «Aplicar». No hay control para ocultar las acciones internas (CA-13).
 */
export function ActivityFilters(props: ActivityFiltersProps): React.JSX.Element {
  const { filters, invalidRange, onChange } = props;
  const errorId = React.useId();
  const describedBy = invalidRange ? errorId : undefined;
  return (
    <Card role="region" aria-labelledby="filtros-titulo" className="p-4 sm:p-5">
      <h2 id="filtros-titulo" className="sr-only">
        Filtros
      </h2>
      <form noValidate className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          <OriginFilter origin={filters.origin} onChange={onChange} />
          <DateFilters filters={filters} errorId={describedBy} onChange={onChange} />
        </div>
        {invalidRange ? <RangeError id={errorId} /> : null}
        <FiltersFooter {...props} />
      </form>
    </Card>
  );
}
