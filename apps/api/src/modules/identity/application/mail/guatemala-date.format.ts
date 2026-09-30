const GUATEMALA_TIME_ZONE = 'America/Guatemala';

const guatemalaFormat = new Intl.DateTimeFormat('es-GT', {
  timeZone: GUATEMALA_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Fecha `dd/mm/aaaa` y hora `HH:mm` de Guatemala para los textos de los correos. */
export interface GuatemalaDateTime {
  readonly date: string;
  readonly time: string;
}

/**
 * Fecha y hora de Guatemala (UTC-6, sin horario de verano) sin depender de la zona del servidor. Se arma por partes
 * para no depender del patrón de la ICU.
 */
export const formatGuatemalaDateTime = (at: Date): GuatemalaDateTime => {
  const parts = new Map(guatemalaFormat.formatToParts(at).map((part) => [part.type, part.value]));
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.get(type) ?? '';
  return {
    date: `${part('day')}/${part('month')}/${part('year')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
};
