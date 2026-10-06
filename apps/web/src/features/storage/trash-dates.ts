/** Fechas de la papelera calculadas en `web` desde `purgeAt` y `deletedAt` (plan 006 §4). */

const DAY_MS = 86_400_000;

/** Umbral fijo de la UI para el aviso de purga próxima y el reloj de la fila (spec 006 §6). */
export const PURGE_SOON_DAYS = 7;

/** Días que faltan para la purga, redondeados hacia arriba; 0 si ya venció. */
export function daysLeft(purgeAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(purgeAt) - now) / DAY_MS));
}

/** Vencido o fijado a «ahora» por «Vaciar papelera»: sigue en la lista hasta que el trabajo lo purga (plan R-1). */
export function isPurgeDue(purgeAt: string, now: number): boolean {
  return Date.parse(purgeAt) <= now;
}

export function remainingLabel(days: number): string {
  return days === 1 ? 'queda 1 día' : `quedan ${String(days)} días`;
}

const dayMonthFormatter = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short' });
const timeFormatter = new Intl.DateTimeFormat('es-GT', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** Para la línea de la fila en móvil: «Eliminado hoy» o «Eliminado el 28 sept». */
export function deletedPhrase(deletedAt: string, now: number): string {
  const deleted = new Date(deletedAt);
  return sameDay(deleted, new Date(now))
    ? 'Eliminado hoy'
    : `Eliminado el ${dayMonthFormatter.format(deleted)}`;
}

/** «hoy · 09:40» si se eliminó hoy; si no, «28 sept». */
export function deletedAtLabel(deletedAt: string, now: number): string {
  const deleted = new Date(deletedAt);
  return sameDay(deleted, new Date(now))
    ? `hoy · ${timeFormatter.format(deleted)}`
    : dayMonthFormatter.format(deleted);
}
