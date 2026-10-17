import {
  ACTIVE_NOW_LABEL,
  dateTimeLabel,
  lastActivityLabel,
  longDayLabel,
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
