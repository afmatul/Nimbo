/**
 * Presentación mínima de valores cacheados XLSX (D2): solo fechas, horas y porcentajes.
 * No es un motor de formatos de Excel: monedas, separadores de miles, fracciones, colores o
 * condiciones se muestran como el valor guardado. Fechas siempre en dd/mm/aaaa y hora de 24 h.
 */
export type CellFormat =
  | { readonly kind: 'general' }
  | {
      readonly kind: 'date';
      readonly date: boolean;
      readonly time: boolean;
      readonly seconds: boolean;
    }
  | { readonly kind: 'percent'; readonly decimals: number };

const GENERAL: CellFormat = { kind: 'general' };
const DAY_MS = 86_400_000;
/** 31/12/9999 en el sistema 1900: último día representable por Excel. */
const MAX_SERIAL = 2_958_465;

/** ECMA-376-1 §18.8.30: formatos integrados de fecha/hora y porcentaje (sin los asiáticos 27–36/50–58). */
const BUILT_IN: Readonly<Record<number, CellFormat>> = {
  9: { kind: 'percent', decimals: 0 },
  10: { kind: 'percent', decimals: 2 },
  14: dateFormat(true, false, false),
  15: dateFormat(true, false, false),
  16: dateFormat(true, false, false),
  17: dateFormat(true, false, false),
  18: dateFormat(false, true, false),
  19: dateFormat(false, true, true),
  20: dateFormat(false, true, false),
  21: dateFormat(false, true, true),
  22: dateFormat(true, true, false),
  45: dateFormat(false, true, true),
  46: dateFormat(false, true, true),
  47: dateFormat(false, true, true),
};

function dateFormat(date: boolean, time: boolean, seconds: boolean): CellFormat {
  return { kind: 'date', date, time, seconds };
}

/** Primera sección sin literales, escapes, rellenos ni corchetes (color, locale); `[h]` cuenta como hora. */
function significantTokens(code: string): string {
  const section = code.replace(/"[^"]*"|\\./g, '').split(';')[0] ?? '';
  return section
    .replace(/\[(h+|m+|s+)\]/gi, '$1')
    .replace(/\[[^\]]*\]|[_*]./g, '')
    .toLowerCase();
}

export function cellFormatOf(numFmtId: number, code: string | undefined): CellFormat {
  if (code === undefined) return BUILT_IN[numFmtId] ?? GENERAL;
  const tokens = significantTokens(code);
  if (tokens.includes('%'))
    return { kind: 'percent', decimals: /\.([0#?]+)/.exec(tokens)?.[1]?.length ?? 0 };
  if (tokens === 'general' || !/[ydmhs]/.test(tokens)) return GENERAL;
  const time = /[hs]/.test(tokens);
  return dateFormat(/[yd]/.test(tokens) || !time, time, tokens.includes('s'));
}

const pad = (value: number): string => String(value).padStart(2, '0');

function dayText(day: Date): string {
  const year = String(day.getUTCFullYear()).padStart(4, '0');
  return `${pad(day.getUTCDate())}/${pad(day.getUTCMonth() + 1)}/${year}`;
}

/** Sistema 1900 con el 29/02/1900 inexistente que Excel conserva por compatibilidad con Lotus 1-2-3. */
function serialDay(days: number, date1904: boolean): string {
  if (date1904) return dayText(new Date(Date.UTC(1904, 0, 1) + days * DAY_MS));
  if (days === 0) return '00/01/1900';
  if (days === 60) return '29/02/1900';
  return dayText(new Date(Date.UTC(1899, 11, days < 60 ? 31 : 30) + days * DAY_MS));
}

function timeText(seconds: number, withSeconds: boolean): string {
  const text = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}`;
  return withSeconds ? `${text}:${pad(seconds % 60)}` : text;
}

/** Serial de fecha a texto determinista (UTC, sin Intl); `undefined` si no es un día de Excel. */
export function formatSerial(
  serial: number,
  format: Extract<CellFormat, { kind: 'date' }>,
  date1904: boolean,
): string | undefined {
  // El último día representable es el mismo en ambos sistemas; 1904 lo alcanza 1462 seriales antes.
  const lastDay = date1904 ? MAX_SERIAL - 1462 : MAX_SERIAL;
  if (!Number.isFinite(serial) || serial < 0 || serial >= lastDay + 1) return undefined;
  let days = Math.floor(serial);
  let seconds = Math.round((serial - days) * 86_400);
  if (format.time && seconds === 86_400) {
    days++;
    seconds = 0;
  }
  if (days > lastDay) return undefined;
  const parts = [
    format.date ? serialDay(days, date1904) : '',
    format.time ? timeText(seconds, format.seconds) : '',
  ];
  return parts.filter(Boolean).join(' ');
}

export function formatPercent(value: number, decimals: number): string {
  return `${(value * 100).toFixed(decimals)} %`;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z?)?$/;

/** `t="d"` de Strict: ISO 8601 validado por ida y vuelta en UTC, sin conversión de zona horaria. */
export function formatIsoDate(text: string, format: CellFormat): string | undefined {
  const match = ISO.exec(text);
  if (match === null) return undefined;
  const [year, month, day, hours = 0, minutes = 0, secs = 0] = match
    .slice(1)
    .map((part) => Number(part ?? 0));
  // Date.UTC trata los años 0–99 como 1900–1999; setUTCFullYear conserva el año de la celda.
  const value = new Date(0);
  value.setUTCFullYear(year ?? 0, (month ?? 1) - 1, day ?? 1);
  if (value.getUTCDate() !== day || value.getUTCMonth() + 1 !== month) return undefined;
  if (hours > 23 || minutes > 59 || secs > 59) return undefined;
  // Sin formato de fecha: la hora solo si no es medianoche y los segundos solo si no son cero.
  const timed = format.kind === 'date' ? format.time : hours + minutes + secs > 0;
  const withSeconds = format.kind === 'date' ? format.seconds : secs > 0;
  const parts = [
    format.kind !== 'date' || format.date ? dayText(value) : '',
    timed ? timeText(hours * 3600 + minutes * 60 + secs, withSeconds) : '',
  ];
  return parts.filter(Boolean).join(' ');
}
