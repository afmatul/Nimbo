import {
  ACTIVE_NOW_LABEL,
  calendarDayLabel,
  dateTimeLabel,
  dayInputValue,
  dayLabel,
  lastActivityLabel,
  dayMonthLabel,
  absoluteDateTimeLabel,
  lastDayInputValue,
  lastDayLabel,
  longDayLabel,
  longLastDayLabel,
  startedOnLabel,
} from './format-date';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.parse('2026-09-26T15:00:00.000Z');

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe('fechas de «Seguridad» (CA-11, D-16)', () => {
  it('CA-11: actividad de hace menos de un minuto es «Activa ahora»', () => {
    expect(lastActivityLabel(ago(30_000), NOW)).toBe(ACTIVE_NOW_LABEL);
    expect(ACTIVE_NOW_LABEL).toBe('Activa ahora');
  });

  it('CA-11: «Última actividad: hace 2 horas» con la unidad más grande que cabe', () => {
    expect(lastActivityLabel(ago(2 * HOUR_MS + 10 * MINUTE_MS), NOW)).toBe(
      'Última actividad: hace 2 horas',
    );
    expect(lastActivityLabel(ago(5 * MINUTE_MS), NOW)).toBe('Última actividad: hace 5 minutos');
    expect(lastActivityLabel(ago(3 * DAY_MS), NOW)).toBe('Última actividad: hace 3 días');
    expect(lastActivityLabel(ago(DAY_MS), NOW)).toBe('Última actividad: hace 1 día');
  });

  it('CA-11: «Iniciada el 24 sep 2026» en hora de Guatemala aunque en UTC ya sea otro día', () => {
    // 2026-09-25 03:00 UTC = 2026-09-24 21:00 en Guatemala (UTC−6).
    expect(startedOnLabel('2026-09-25T03:00:00.000Z')).toMatch(/^Iniciada el 24 sept 2026$/);
    expect(startedOnLabel('2026-09-02T15:00:00.000Z')).toMatch(/^Iniciada el 2 sept 2026$/);
  });
});

describe('longDayLabel (009, mockup `billing/suscripcion/`)', () => {
  it('escribe el mes completo y usa el día de Guatemala', () => {
    expect(longDayLabel('2026-09-01T12:00:00.000Z')).toBe('1 de septiembre de 2026');
    expect(longDayLabel('2026-10-01T03:00:00.000Z')).toBe('30 de septiembre de 2026');
  });
});

describe('dayMonthLabel (020b CA-8)', () => {
  it('escribe el día y el mes completo, sin año, con el día de Guatemala', () => {
    expect(dayMonthLabel('2026-11-01T12:00:00.000Z')).toBe('1 de noviembre');
    expect(dayMonthLabel('2026-11-01T03:00:00.000Z')).toBe('31 de octubre');
  });
});

describe('último día en que rige un instante de fin (011b RN-8, CA-9)', () => {
  // 2026-12-01 06:00 UTC = 2026-12-01 00:00 en Guatemala: el último día que rige es el 30 de noviembre.
  const MIDNIGHT_END = '2026-12-01T06:00:00.000Z';
  // 2026-11-04 18:00 UTC = 12:00 en Guatemala: un `vence_en` de la 010 se ve igual que hoy.
  const MIDDAY_END = '2026-11-04T18:00:00.000Z';

  it('CA-9: a medianoche de Guatemala muestra el día anterior', () => {
    expect(longLastDayLabel(MIDNIGHT_END)).toBe('30 de noviembre de 2026');
    expect(lastDayLabel(MIDNIGHT_END)).toBe(dayLabel('2026-11-30T18:00:00.000Z'));
  });

  it('CA-9: con hora intermedia muestra el mismo día que el instante', () => {
    expect(longLastDayLabel(MIDDAY_END)).toBe(longDayLabel(MIDDAY_END));
    expect(lastDayLabel(MIDDAY_END)).toBe(dayLabel(MIDDAY_END));
  });
});

describe('días del calendario de los ajustes (011b RN-1, RN-2, RN-8)', () => {
  it('CA-7: el valor inicial del campo es el último día que se muestra (`YYYY-MM-DD`)', () => {
    expect(lastDayInputValue('2026-12-01T06:00:00.000Z')).toBe('2026-11-30');
    expect(lastDayInputValue('2026-11-30T18:00:00.000Z')).toBe('2026-11-30');
  });

  it('CA-7: hoy es el día de Guatemala aunque en UTC ya sea el siguiente', () => {
    expect(dayInputValue(Date.parse('2026-10-27T03:00:00.000Z'))).toBe('2026-10-26');
  });

  it('CA-1: un día elegido se muestra con el formato corto del sistema', () => {
    expect(calendarDayLabel('2026-11-30')).toBe(dayLabel('2026-11-30T18:00:00.000Z'));
  });
});

describe('fecha y hora de una versión (014 CA-6)', () => {
  // 2026-10-08 16:42 UTC = 10:42 en Guatemala (UTC−6).
  const TODAY = Date.parse('2026-10-08T16:42:00.000Z');

  it('CA-6: hoy y ayer con la hora de Guatemala', () => {
    expect(dateTimeLabel('2026-10-08T16:42:00.000Z', TODAY)).toBe('hoy, 10:42');
    expect(dateTimeLabel('2026-10-07T23:20:00.000Z', TODAY)).toBe('ayer, 17:20');
  });

  it('CA-6: antes de ayer, con la fecha completa', () => {
    expect(dateTimeLabel('2026-10-02T15:15:00.000Z', TODAY)).toMatch(/^2 oct 2026, 09:15$/);
  });

  it('CA-6: el día es el de Guatemala aunque en UTC ya sea el siguiente', () => {
    // 2026-10-08 03:00 UTC = 2026-10-07 21:00 en Guatemala.
    expect(dateTimeLabel('2026-10-08T03:00:00.000Z', TODAY)).toBe('ayer, 21:00');
  });
});

describe('vencimiento de un enlace público (013b CA-1)', () => {
  it('CA-1: «14 nov 2026, 14:30», fecha absoluta en hora de Guatemala', () => {
    expect(absoluteDateTimeLabel('2026-11-14T20:30:00.000Z')).toBe('14 nov 2026, 14:30');
  });

  it('CA-1: nunca «hoy» ni «ayer», aunque venza hoy', () => {
    expect(absoluteDateTimeLabel(new Date().toISOString())).not.toMatch(/^(hoy|ayer)/);
  });

  it('CA-1: el día es el de Guatemala aunque en UTC ya sea el siguiente', () => {
    expect(absoluteDateTimeLabel('2026-11-15T03:00:00.000Z')).toBe('14 nov 2026, 21:00');
  });
});
