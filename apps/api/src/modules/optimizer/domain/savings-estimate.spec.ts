import { SavingsEstimate } from './savings-estimate';

/** Umbral del plan §6 A: 1 MB **y** 20 %. */
const THRESHOLD = { minBytes: 1_000_000n, minPercent: 20 };

describe('SavingsEstimate (plan 021 §2, RN-2)', () => {
  it('conviene si ahorra a la vez el mínimo de bytes y el de porcentaje', () => {
    const estimate = new SavingsEstimate(10_000_000n, 7_000_000n);

    expect(estimate.savedBytes).toBe(3_000_000n);
    expect(estimate.isWorthIt(THRESHOLD)).toBe(true);
  });

  it('los dos mínimos son inclusivos: exactamente 1 MB y exactamente 20 % conviene', () => {
    expect(new SavingsEstimate(5_000_000n, 4_000_000n).isWorthIt(THRESHOLD)).toBe(true);
  });

  it('cumple los bytes pero no el porcentaje → no conviene', () => {
    // 2 MB sobre 40 MB = 5 %.
    expect(new SavingsEstimate(40_000_000n, 38_000_000n).isWorthIt(THRESHOLD)).toBe(false);
  });

  it('cumple el porcentaje pero no los bytes → no conviene', () => {
    // 500 kB sobre 1 MB = 50 %.
    expect(new SavingsEstimate(1_000_000n, 500_000n).isWorthIt(THRESHOLD)).toBe(false);
  });

  it.each([
    ['igual', 4_000_000n],
    ['mayor', 4_500_000n],
  ])(
    'un resultado %s que el original nunca conviene, aunque el umbral sea cero',
    (_case, result) => {
      const estimate = new SavingsEstimate(4_000_000n, result);

      expect(estimate.isWorthIt({ minBytes: 0n, minPercent: 0 })).toBe(false);
      expect(estimate.savedBytes <= 0n).toBe(true);
    },
  );

  it('el porcentaje se compara en enteros, sin redondear un 19,99 % a 20 %', () => {
    // 1 999 900 sobre 10 000 000 = 19,999 %.
    expect(new SavingsEstimate(10_000_000n, 8_000_100n).isWorthIt(THRESHOLD)).toBe(false);
  });

  it.each([
    ['un original no positivo', 0n, 1n],
    ['un resultado no positivo', 1n, 0n],
  ])('rechaza %s (error de programación)', (_case, original, result) => {
    expect(() => new SavingsEstimate(original, result)).toThrow(TypeError);
  });
});
