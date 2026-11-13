'use client';

import { STORAGE_FIELD_MESSAGES } from '@nimbo/contracts';
import { CircleAlert } from 'lucide-react';
import * as React from 'react';

import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select } from '../../../components/ui/select';
import { DATE_OPTIONS, type DateOption, type SearchFilters } from '../search-url';

/** Fecha de modificación (CA-8): atajos en un `select` y, con «Rango personalizado», «Desde» y «Hasta». */

type OnChange = (patch: Partial<SearchFilters>) => void;

const DATE_LABELS: Readonly<Record<DateOption, string>> = {
  cualquiera: 'Cualquier fecha',
  'ultimos-7-dias': 'Últimos 7 días',
  'ultimos-30-dias': 'Últimos 30 días',
  'este-anio': 'Este año',
  rango: 'Rango personalizado',
};

const DATE_SELECT_OPTIONS = DATE_OPTIONS.map((value) => ({ value, label: DATE_LABELS[value] }));

const SELECT_CLASSES = 'w-full sm:w-60';

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
      <Select
        id="buscar-fecha"
        value={date}
        options={DATE_SELECT_OPTIONS}
        onValueChange={(value) => onChange({ date: value })}
        className={SELECT_CLASSES}
      />
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
      <span>{STORAGE_FIELD_MESSAGES.INVALID_RANGE}</span>
    </p>
  );
}
