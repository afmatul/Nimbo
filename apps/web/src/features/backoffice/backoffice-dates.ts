import { DATE_LOCALE } from '../../lib/format-date';

/**
 * Fechas absolutas en la zona de quien consulta (mockups de `backoffice/`, decisión 7 de `soporte`): el personal interno
 * las cruza con lo que le cuenta la persona. Las usan la tabla de metadatos y la de cuentas.
 */
const dateTimeFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dayFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** «03/10/2026, 12:11». */
export const dateTimeText = (iso: string): string => dateTimeFormatter.format(new Date(iso));

/** «01/09/2026». */
export const dayText = (iso: string): string => dayFormatter.format(new Date(iso));
