/** Fechas que ve la persona: en español de Guatemala y, si importa el día, en hora de Guatemala (spec 002 D-16). */

export const DATE_LOCALE = 'es-GT';

const DISPLAY_TIME_ZONE = 'America/Guatemala';

export const ACTIVE_NOW_LABEL = 'Activa ahora';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** De la unidad más grande a la más chica; las sesiones no viven más de 30 días (`SESSION_MAX_LIFETIME_DAYS`). */
const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['day', DAY_MS],
  ['hour', HOUR_MS],
  ['minute', MINUTE_MS],
];

const relativeFormatter = new Intl.RelativeTimeFormat('es');

const startedOnFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dayKeyFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const clockFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** «hace 2 horas»: la unidad más grande que cabe, redondeada hacia abajo. */
function timeAgo(elapsedMs: number): string {
  const [unit, unitMs] = RELATIVE_UNITS.find(([, ms]) => elapsedMs >= ms) ?? ['minute', MINUTE_MS];
  return relativeFormatter.format(-Math.floor(elapsedMs / unitMs), unit);
}

/** «Activa ahora» si la actividad fue hace menos de un minuto; si no, «Última actividad: hace 2 horas». */
export function lastActivityLabel(lastActiveAt: string, now: number): string {
  const elapsedMs = now - Date.parse(lastActiveAt);
  return elapsedMs < MINUTE_MS ? ACTIVE_NOW_LABEL : `Última actividad: ${timeAgo(elapsedMs)}`;
}

const longDayFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** «1 de septiembre de 2026», con el día de Guatemala (mockup `billing/suscripcion/`). */
export function longDayLabel(isoDate: string): string {
  return longDayFormatter.format(new Date(isoDate));
}

/** «24 sep 2026», con el día de Guatemala. */
export function dayLabel(isoDate: string): string {
  return startedOnFormatter.format(new Date(isoDate));
}

/** Un instante de fin (`vence_en`, `cuota_extra_hasta`) rige hasta el milisegundo anterior (011b RN-8). */
function lastInstantOf(endIso: string): Date {
  return new Date(Date.parse(endIso) - 1);
}

/** «30 de noviembre de 2026»: el último día de Guatemala en que rige un instante de fin; «Venció el» no la usa. */
export function longLastDayLabel(endIso: string): string {
  return longDayFormatter.format(lastInstantOf(endIso));
}

/** «30 nov 2026»: como `longLastDayLabel`, en formato corto. */
export function lastDayLabel(endIso: string): string {
  return startedOnFormatter.format(lastInstantOf(endIso));
}

/** «Iniciada el 24 sep 2026», con el día de Guatemala. */
export function startedOnLabel(startedAt: string): string {
  return `Iniciada el ${dayLabel(startedAt)}`;
}

/** Día de Guatemala de un instante, para comparar «hoy» y «ayer». */
function dayKey(instant: number): string {
  return dayKeyFormatter.format(new Date(instant));
}

/** «hoy», «ayer» o la fecha corta, con el día de Guatemala. */
function relativeDayLabel(instant: number, now: number): string {
  const key = dayKey(instant);
  if (key === dayKey(now)) return 'hoy';
  if (key === dayKey(now - DAY_MS)) return 'ayer';
  return startedOnFormatter.format(new Date(instant));
}

/** «hoy, 10:42», «ayer, 17:20» o «2 oct 2026, 09:15», con el día y la hora de Guatemala (014 CA-6). */
export function dateTimeLabel(iso: string, now: number): string {
  const instant = Date.parse(iso);
  return `${relativeDayLabel(instant, now)}, ${clockFormatter.format(new Date(instant))}`;
}
