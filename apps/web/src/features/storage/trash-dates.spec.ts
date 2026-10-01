import {
  daysLeft,
  deletedAtLabel,
  deletedPhrase,
  isPurgeDue,
  PURGE_SOON_DAYS,
  remainingLabel,
} from './trash-dates';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.parse('2026-09-30T15:00:00.000Z');

describe('fechas de la papelera (CA-12, CA-19)', () => {
  it('CA-12: los días restantes se cuentan hacia arriba desde purgeAt', () => {
    expect(daysLeft(new Date(NOW + 60 * DAY_MS - HOUR_MS).toISOString(), NOW)).toBe(60);
    expect(daysLeft(new Date(NOW + 2 * HOUR_MS).toISOString(), NOW)).toBe(1);
    expect(daysLeft(new Date(NOW - HOUR_MS).toISOString(), NOW)).toBe(0);
  });

  it('CA-18: un elemento con purgeAt vencido espera la purga («Vaciando…»)', () => {
    expect(isPurgeDue(new Date(NOW).toISOString(), NOW)).toBe(true);
    expect(isPurgeDue(new Date(NOW + HOUR_MS).toISOString(), NOW)).toBe(false);
  });

  it('CA-12: «quedan n días» y «queda 1 día»', () => {
    expect(remainingLabel(58)).toBe('quedan 58 días');
    expect(remainingLabel(1)).toBe('queda 1 día');
    expect(PURGE_SOON_DAYS).toBe(7);
  });

  it('CA-12: la fecha de eliminación de hoy lleva la hora; las demás, día y mes', () => {
    const today = deletedAtLabel(new Date(NOW - HOUR_MS).toISOString(), NOW);
    const earlier = deletedAtLabel('2026-09-28T10:00:00.000Z', NOW);

    expect(today).toMatch(/^hoy · \d{2}:\d{2}$/);
    expect(earlier).toMatch(/^28 sep/);
    expect(deletedPhrase(new Date(NOW - HOUR_MS).toISOString(), NOW)).toBe('Eliminado hoy');
    expect(deletedPhrase('2026-09-28T10:00:00.000Z', NOW)).toMatch(/^Eliminado el 28 sep/);
  });
});
