import { endOfGuatemalaDay } from './subscription-adjustment';

describe('endOfGuatemalaDay (011b RN-1, RN-2, RN-8)', () => {
  it('CA-1, CA-6: un día de Guatemala termina a las 00:00 del día siguiente en Guatemala, las 06:00 UTC', () => {
    expect(endOfGuatemalaDay('2026-11-30').toISOString()).toBe('2026-12-01T06:00:00.000Z');
  });

  it('CA-1: el último día del año pasa al 1 de enero siguiente', () => {
    expect(endOfGuatemalaDay('2026-12-31').toISOString()).toBe('2027-01-01T06:00:00.000Z');
  });

  it('CA-1: el 28 de febrero de un año bisiesto pasa al 29', () => {
    expect(endOfGuatemalaDay('2028-02-28').toISOString()).toBe('2028-02-29T06:00:00.000Z');
  });

  it('RN-8: el instante menos 1 ms vuelve a ser el día elegido en Guatemala', () => {
    const end = endOfGuatemalaDay('2026-11-30');
    const lastDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(
      new Date(end.getTime() - 1),
    );

    expect(lastDay).toBe('2026-11-30');
  });
});
