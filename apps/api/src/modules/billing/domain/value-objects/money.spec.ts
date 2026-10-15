import { Money } from './money';

describe('Money (spec 009 RN-1, ADR-0016)', () => {
  it('RN-1: guarda centavos enteros', () => {
    expect(Money.ofCents(11_000).cents).toBe(11_000);
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'RN-1: rechaza %p (no son centavos enteros no negativos)',
    (cents) => {
      expect(() => Money.ofCents(cents)).toThrow(RangeError);
    },
  );
});
