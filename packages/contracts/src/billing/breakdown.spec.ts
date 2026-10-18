import { breakdown } from './breakdown';

describe('breakdown (spec 009 RN-2)', () => {
  it('RN-2: Equipo (11 000) → subtotal 9 821, IVA 1 179, total 11 000', () => {
    expect(breakdown(11_000)).toEqual({ subtotalCents: 9821, vatCents: 1179, totalCents: 11_000 });
  });

  it('RN-2: la mitad de un centavo redondea hacia arriba', () => {
    // 28 × 100 / 112 = 25.0 exacto; 14 × 100 / 112 = 12.5 → 13.
    expect(breakdown(28)).toEqual({ subtotalCents: 25, vatCents: 3, totalCents: 28 });
    expect(breakdown(14)).toEqual({ subtotalCents: 13, vatCents: 1, totalCents: 14 });
  });

  it('RN-2: subtotal + IVA siempre es el precio', () => {
    for (const price of [1, 99, 4_900, 11_000, 25_000, 123_457]) {
      const { subtotalCents, vatCents } = breakdown(price);
      expect(subtotalCents + vatCents).toBe(price);
    }
  });
});
