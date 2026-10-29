import { formatBillingDate, formatBillingLastDay } from './billing-date';

describe('fechas de la facturación (009, 010; 011b RN-8)', () => {
  it('formatBillingDate escribe el día de Guatemala del instante', () => {
    expect(formatBillingDate(new Date('2026-12-01T06:00:00.000Z'))).toBe('1 de diciembre de 2026');
  });

  it('CA-9: un fin a medianoche de Guatemala se muestra como el día anterior, el último en que rige', () => {
    expect(formatBillingLastDay(new Date('2026-12-01T06:00:00.000Z'))).toBe(
      '30 de noviembre de 2026',
    );
  });

  it('CA-9: un fin con hora intermedia se muestra con el mismo día', () => {
    expect(formatBillingLastDay(new Date('2026-11-13T18:00:00.000Z'))).toBe(
      '13 de noviembre de 2026',
    );
  });
});
