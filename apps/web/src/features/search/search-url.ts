import { SEARCH_TYPES, type SearchType } from '@nimbo/contracts';

/**
 * La búsqueda en la dirección de la página (018 CA-12): texto, tipo y fecha de modificación, y su traducción a la
 * consulta de `GET /search` (CA-8). Funciones puras; el hook `useSearch` las usa.
 */

export const SEARCH_PATH = '/buscar';

/** «Cualquier fecha», los atajos y «Rango personalizado» (CA-8), con el valor que viaja en `fecha`. */
export const DATE_OPTIONS = [
  'cualquiera',
  'ultimos-7-dias',
  'ultimos-30-dias',
  'este-anio',
  'rango',
] as const;
export type DateOption = (typeof DATE_OPTIONS)[number];

/** «Todos» no manda `type` (CA-7). */
export type TypeOption = 'all' | SearchType;

/** Filtros de la pantalla; `fromDay` y `toDay` son días locales `AAAA-MM-DD`, solo con «Rango personalizado». */
export interface SearchFilters {
  readonly type: TypeOption;
  readonly date: DateOption;
  readonly fromDay: string;
  readonly toDay: string;
}

export const NO_SEARCH_FILTERS: SearchFilters = {
  type: 'all',
  date: 'cualquiera',
  fromDay: '',
  toDay: '',
};

export interface SearchState {
  readonly q: string;
  readonly filters: SearchFilters;
}

/** `GET /search`: `from` inclusivo y `to` exclusivo, como instantes ISO (plan §4). */
export interface SearchRequest {
  readonly q: string;
  readonly type?: SearchType;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
}

const PARAM = { q: 'q', type: 'tipo', date: 'fecha', fromDay: 'desde', toDay: 'hasta' } as const;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Días que abarca cada atajo, contando hoy. */
const LAST_DAYS: Partial<Readonly<Record<DateOption, number>>> = {
  'ultimos-7-dias': 7,
  'ultimos-30-dias': 30,
};

function oneOf<T extends string>(options: readonly T[], value: string | null, fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

const dayOf = (value: string | null): string =>
  value !== null && DAY_PATTERN.test(value) ? value : '';

/** Un valor desconocido se lee como «sin filtro»; los días solo cuentan con «Rango personalizado». */
export function readSearchState(search: string): SearchState {
  const params = new URLSearchParams(search);
  const date = oneOf(DATE_OPTIONS, params.get(PARAM.date), 'cualquiera');
  const custom = date === 'rango';
  return {
    q: (params.get(PARAM.q) ?? '').trim(),
    filters: {
      type: oneOf<TypeOption>(SEARCH_TYPES, params.get(PARAM.type), 'all'),
      date,
      fromDay: custom ? dayOf(params.get(PARAM.fromDay)) : '',
      toDay: custom ? dayOf(params.get(PARAM.toDay)) : '',
    },
  };
}

/** Cadena de consulta sin `?`; los valores por defecto no viajan. */
export function writeSearchState({ q, filters }: SearchState): string {
  const custom = filters.date === 'rango';
  const entries: [string, string][] = [
    [PARAM.q, q],
    [PARAM.type, filters.type === 'all' ? '' : filters.type],
    [PARAM.date, filters.date === 'cualquiera' ? '' : filters.date],
    [PARAM.fromDay, custom ? filters.fromDay : ''],
    [PARAM.toDay, custom ? filters.toDay : ''],
  ];
  return new URLSearchParams(entries.filter(([, value]) => value !== '')).toString();
}

/** Un día «Hasta» igual a «Desde» es válido: abarca ese día entero (copia de `use-activity`, 004; segundo uso). */
export function isInvalidRange({ fromDay, toDay }: SearchFilters): boolean {
  return fromDay !== '' && toDay !== '' && toDay < fromDay;
}

/** Medianoche local de `day` más `offsetDays`, como instante UTC (copia de `use-activity`, 004; segundo uso). */
function localDayStart(day: string, offsetDays: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date + offsetDays).toISOString();
}

/** `AAAA-MM-DD` local de `today` más `offsetDays`. */
function localDay(today: Date, offsetDays: number): string {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(day.getFullYear())}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** Los atajos equivalen a un rango de días que termina hoy (CA-8). */
function daysOf(filters: SearchFilters, today: Date): Pick<SearchFilters, 'fromDay' | 'toDay'> {
  const lastDays = LAST_DAYS[filters.date];
  if (lastDays !== undefined)
    return { fromDay: localDay(today, 1 - lastDays), toDay: localDay(today, 0) };
  if (filters.date === 'este-anio') {
    return { fromDay: `${String(today.getFullYear())}-01-01`, toDay: localDay(today, 0) };
  }
  return { fromDay: filters.fromDay, toDay: filters.toDay };
}

/** La consulta de `state`, o `null` si no se consulta: sin texto (CA-6) o con un rango inválido (CA-9). */
export function toSearchRequest({ q, filters }: SearchState, today: Date): SearchRequest | null {
  if (q === '' || isInvalidRange(filters)) return null;
  const { fromDay, toDay } = daysOf(filters, today);
  return {
    q,
    ...(filters.type === 'all' ? {} : { type: filters.type }),
    ...(fromDay === '' ? {} : { from: localDayStart(fromDay, 0) }),
    ...(toDay === '' ? {} : { to: localDayStart(toDay, 1) }),
  };
}

/** Filtros que acotan de verdad: un «Rango personalizado» sin días no cuenta (CA-11). */
export function activeFilterCount({ type, date, fromDay, toDay }: SearchFilters): number {
  const dateActive = date !== 'cualquiera' && (date !== 'rango' || fromDay !== '' || toDay !== '');
  return (type === 'all' ? 0 : 1) + (dateActive ? 1 : 0);
}
