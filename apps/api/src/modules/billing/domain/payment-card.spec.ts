import { isCardExpired } from './payment-card';

const NOW = new Date('2026-10-14T12:00:00.000Z');

describe('PaymentCard (spec 009 RN-3, RN-9)', () => {
  it('RN-9: vence al terminar su mes (UTC): octubre de 2026 sigue vigente en octubre', () => {
    expect(isCardExpired({ number: '4242424242424242', expMonth: 10, expYear: 2026 }, NOW)).toBe(
      false,
    );
  });

  it.each([
    [9, 2026],
    [12, 2025],
  ])('RN-9: %i/%i ya venció', (expMonth, expYear) => {
    expect(isCardExpired({ number: '4242424242424242', expMonth, expYear }, NOW)).toBe(true);
  });
});
