'use client';

import { CircleAlert } from 'lucide-react';
import * as React from 'react';

import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import type { DateOption, SearchFilters } from '../search-url';

/** Fecha de modificación (CA-8): atajos en un `select` y, con «Rango personalizado», «Desde» y «Hasta». */

type OnChange = (patch: Partial<SearchFilters>) => void;

const DATE_LABELS: Readonly<Record<DateOption, string>> = {
  cualquiera: 'Cualquier fecha',
  'ultimos-7-dias': 'Últimos 7 días',
  'ultimos-30-dias': 'Últimos 30 días',
  'este-anio': 'Este año',
  rango: 'Rango personalizado',
};

/** El texto de la spec §6 dice «igual o posterior»: un mismo día en «Desde» y «Hasta» es válido. */
const INVALID_RANGE_MESSAGE =
  'La fecha final debe ser igual o posterior a la inicial. Corrige el rango para buscar.';

const SELECT_CLASSES =
  'h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-60';

const DATE_OPTIONS = Object.keys(DATE_LABELS) as DateOption[];

export function DateSelect({
  date,
  onChange,
}: {
  readonly date: DateOption;
  readonly onChange: OnChange;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor="buscar-fecha">Modificado</Label>
      <select
        id="buscar-fecha"
        value={date}
        onChange={(event) => onChange({ date: event.target.value as DateOption })}
        className={SELECT_CLASSES}
      >
        {DATE_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {DATE_LABELS[value]}
          </option>
        ))}
      </select>
    </div>
  );
}

function DayField({
  label,
  value,
  onValue,
  errorId,
}: {
  readonly label: string;
  readonly value: string;
  readonly onValue: (day: string) => void;
  readonly errorId: string | undefined;
}): React.JSX.Element {
  const id = React.useId();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-none">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={value}
        error={errorId !== undefined}
        aria-describedby={errorId}
        className="tabular-nums sm:w-44"
        onChange={(event) => onValue(event.target.value)}
      />
    </div>
  );
}

/** «Desde» y «Hasta» de «Rango personalizado»: con un rango inválido siguen editables, que es como se corrige (CA-9). */
export function RangeFields({
  filters,
  onChange,
  errorId,
}: {
  readonly filters: SearchFilters;
  readonly onChange: OnChange;
  readonly errorId: string | undefined;
}): React.JSX.Element {
  return (
    <>
      <DayField
        label="Desde"
        value={filters.fromDay}
        errorId={errorId}
        onValue={(fromDay) => onChange({ fromDay })}
      />
      <DayField
        label="Hasta"
        value={filters.toDay}
        errorId={errorId}
        onValue={(toDay) => onChange({ toDay })}
      />
    </>
  );
}

export function RangeError({ id }: { readonly id: string }): React.JSX.Element {
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
