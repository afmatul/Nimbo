import { isChargeable, isPresentCard } from './payment-instrument';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const card = (expMonth: number, expYear: number) => ({
  number: '4242424242424242',
  expMonth,
  expYear,
});

describe('PaymentInstrument (spec 010 RN-2, M-2)', () => {
  it('M-2: una tarjeta es presente; una referencia, no', () => {
    expect(isPresentCard(card(12, 2030))).toBe(true);
    expect(isPresentCard('SIM-TOK-ok-1')).toBe(false);
  });

  it('RN-9: la tarjeta presente se cobra hasta el fin de su mes y después no', () => {
    expect(isChargeable(card(10, 2026), NOW)).toBe(true);
    expect(isChargeable(card(9, 2026), NOW)).toBe(false);
  });

  it('RN-2: una referencia no tiene vencimiento propio: la juzga la pasarela', () => {
    expect(isChargeable('SIM-TOK-ok-1', NOW)).toBe(true);
  });
});
