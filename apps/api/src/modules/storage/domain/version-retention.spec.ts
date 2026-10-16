import { VersionRetention } from './version-retention';

const numbered = (...numbers: number[]): { number: number }[] =>
  numbers.map((number) => ({ number }));

const numbersOf = (versions: readonly { number: number }[]): number[] =>
  versions.map((version) => version.number);

describe('VersionRetention.surplus (CA-13)', () => {
  it('CA-13: sin exceder lo retenido no sobra ninguna', () => {
    expect(VersionRetention.surplus(numbered(1, 2, 3), 3)).toEqual([]);
  });

  it('CA-13: la retención incluye la actual: con 4 y retención 3 sobra la más antigua', () => {
    expect(numbersOf(VersionRetention.surplus(numbered(1, 2, 3, 4), 3))).toEqual([1]);
  });

  it('CA-13: devuelve las sobrantes de la más antigua a la más reciente, sin importar el orden de entrada', () => {
    expect(numbersOf(VersionRetention.surplus(numbered(7, 3, 6, 4, 5), 2))).toEqual([3, 4, 5]);
  });

  it('CA-13: nunca devuelve la actual (la de mayor número), aunque la retención sea 1', () => {
    expect(numbersOf(VersionRetention.surplus(numbered(2, 9, 5), 1))).toEqual([2, 5]);
  });

  it('CA-13: sin versiones no sobra ninguna', () => {
    expect(VersionRetention.surplus([], 3)).toEqual([]);
  });

  it('devuelve los mismos objetos recibidos, sin copiarlos ni mutar la entrada', () => {
    const versions = numbered(3, 1, 2);
    const original = [...versions];

    const surplus = VersionRetention.surplus(versions, 2);

    expect(surplus[0]).toBe(versions[1]);
    expect(versions).toEqual(original);
  });

  it('CA-15: sirve para anticipar qué podaría una versión nueva (agregándola antes de calcular)', () => {
    const wouldPrune = VersionRetention.surplus([...numbered(1, 2, 3), { number: 4 }], 3);

    expect(numbersOf(wouldPrune)).toEqual([1]);
  });

  it.each([0, -1, 1.5])('rechaza una retención que no es un entero positivo (%s)', (retained) => {
    expect(() => VersionRetention.surplus(numbered(1), retained)).toThrow(TypeError);
  });
});
