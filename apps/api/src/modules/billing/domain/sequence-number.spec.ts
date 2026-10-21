import { formatInvoiceNumber, formatPaymentReference } from './sequence-number';

describe('numeración de comprobantes y facturas (spec 009 RN-5, plan §3)', () => {
  it('RN-5: el comprobante es SIM-{año}-{secuencia a 6 dígitos}', () => {
    expect(formatPaymentReference(2026, 1)).toBe('SIM-2026-000001');
  });

  it('RN-5: la factura es NB-{año}-{secuencia a 4 dígitos}', () => {
    expect(formatInvoiceNumber(2026, 42)).toBe('NB-2026-0042');
  });

  it('RN-5: una secuencia más larga que su relleno no se corta (el número sigue siendo único)', () => {
    expect(formatPaymentReference(2027, 1_234_567)).toBe('SIM-2027-1234567');
    expect(formatInvoiceNumber(2027, 12_345)).toBe('NB-2027-12345');
  });
});
