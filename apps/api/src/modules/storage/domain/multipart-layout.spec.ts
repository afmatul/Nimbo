import { expectedPartBytes, planParts } from './multipart-layout';

const MIB = 1_048_576n;
const PART = 8n * MIB;

describe('multipart-layout', () => {
  it('CA-2: parte el tamaño declarado en partes del tamaño configurado, con una última más corta', () => {
    const layout = planParts(20n * MIB, PART);

    expect(layout).toEqual({ totalParts: 3, partSizeBytes: PART });
    expect(expectedPartBytes(20n * MIB, layout, 1)).toBe(PART);
    expect(expectedPartBytes(20n * MIB, layout, 2)).toBe(PART);
    expect(expectedPartBytes(20n * MIB, layout, 3)).toBe(4n * MIB);
  });

  it('CA-2: un tamaño múltiplo exacto del de parte no deja una última parte vacía', () => {
    const layout = planParts(2n * PART, PART);

    expect(layout.totalParts).toBe(2);
    expect(expectedPartBytes(2n * PART, layout, 2)).toBe(PART);
  });

  it('rechaza un número de parte fuera de 1…totalParts', () => {
    const layout = planParts(20n * MIB, PART);

    expect(() => expectedPartBytes(20n * MIB, layout, 0)).toThrow(RangeError);
    expect(() => expectedPartBytes(20n * MIB, layout, 4)).toThrow(RangeError);
  });

  it('rechaza tamaños no positivos', () => {
    expect(() => planParts(0n, PART)).toThrow(RangeError);
    expect(() => planParts(PART, 0n)).toThrow(RangeError);
  });
});
