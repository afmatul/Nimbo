import type { FileKind } from './file-kind';
import { SpaceBreakdown } from './space-breakdown';

const bytesByKind = (entries: [FileKind, bigint][]): ReadonlyMap<FileKind, bigint> =>
  new Map(entries);

describe('SpaceBreakdown', () => {
  it('CA-2: suma los bytes de cada tipo en su categoría', () => {
    const breakdown = SpaceBreakdown.fromBytesByKind(
      bytesByKind([
        ['docx', 10n],
        ['pdf', 20n],
        ['texto', 1n],
        ['xlsx', 2n],
        ['pptx', 3n],
        ['imagen', 40n],
        ['otro', 5n],
      ]),
      0n,
    );

    expect(breakdown.documentsBytes).toBe(36n);
    expect(breakdown.imagesBytes).toBe(40n);
    expect(breakdown.otherBytes).toBe(5n);
  });

  it('CA-2: una categoría sin archivos vale cero', () => {
    const breakdown = SpaceBreakdown.fromBytesByKind(bytesByKind([['pdf', 7n]]), 0n);

    expect(breakdown.imagesBytes).toBe(0n);
    expect(breakdown.otherBytes).toBe(0n);
  });

  it('CA-3: la papelera es un segmento aparte que cuenta en el total', () => {
    const breakdown = SpaceBreakdown.fromBytesByKind(
      bytesByKind([
        ['docx', 10n],
        ['imagen', 20n],
        ['otro', 30n],
      ]),
      40n,
    );

    expect(breakdown.trashBytes).toBe(40n);
    expect(breakdown.totalBytes).toBe(100n);
  });

  it('CA-2: el total cabe en bigint por encima de 2^53 sin perder precisión', () => {
    const big = 2n ** 60n;
    const breakdown = SpaceBreakdown.fromBytesByKind(bytesByKind([['pdf', big]]), 1n);

    expect(breakdown.totalBytes).toBe(big + 1n);
  });

  it('es inmutable', () => {
    const breakdown = SpaceBreakdown.fromBytesByKind(bytesByKind([]), 0n);

    expect(Object.isFrozen(breakdown)).toBe(true);
  });

  it('rechaza bytes negativos', () => {
    expect(() => SpaceBreakdown.fromBytesByKind(bytesByKind([['pdf', -1n]]), 0n)).toThrow(
      TypeError,
    );
    expect(() => SpaceBreakdown.fromBytesByKind(bytesByKind([]), -1n)).toThrow(TypeError);
  });
});
