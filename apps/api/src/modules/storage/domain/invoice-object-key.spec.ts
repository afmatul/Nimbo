import { invoiceObjectKey, isInvoiceObjectKey } from './invoice-object-key';

const USER = '11111111-1111-4111-8111-111111111111';
const INVOICE = '22222222-2222-4222-8222-222222222222';

describe('clave de la factura PDF (009, decisión 1)', () => {
  it('arma invoices/{usuario}/{factura}.pdf y la reconoce', () => {
    const key = invoiceObjectKey(USER, INVOICE);

    expect(key).toBe(`invoices/${USER}/${INVOICE}.pdf`);
    expect(isInvoiceObjectKey(key)).toBe(true);
  });

  it.each([
    `u/${USER}/${INVOICE}/${INVOICE}`,
    `invoices/${USER}/${INVOICE}.txt`,
    `invoices/${USER}/../${INVOICE}.pdf`,
    `invoices/no-uuid/${INVOICE}.pdf`,
  ])('rechaza %s', (key) => {
    expect(isInvoiceObjectKey(key)).toBe(false);
  });
});
