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

/** «24 sep 2026», con el día de Guatemala. */
export function dayLabel(isoDate: string): string {
  return startedOnFormatter.format(new Date(isoDate));
}

/** «Iniciada el 24 sep 2026», con el día de Guatemala. */
export function startedOnLabel(startedAt: string): string {
  return `Iniciada el ${dayLabel(startedAt)}`;
}
