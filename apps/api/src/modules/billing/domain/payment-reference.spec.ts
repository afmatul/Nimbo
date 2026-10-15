import { formatPaymentReference } from './payment-reference';

describe('formatPaymentReference (spec 009 RN-5, plan §3)', () => {
  it('RN-5: SIM-{año}-{secuencia a 6 dígitos}', () => {
    expect(formatPaymentReference(2026, 1)).toBe('SIM-2026-000001');
  });

  it('RN-5: una secuencia de más de 6 dígitos no se corta (la referencia es única)', () => {
    expect(formatPaymentReference(2027, 1_234_567)).toBe('SIM-2027-1234567');
  });
});
