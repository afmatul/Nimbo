import { planParts } from './multipart-layout';
import { assessObjectSize, assessParts } from './uploaded-size';

const MIB = 1_048_576n;
const PART = 8n * MIB;
const DECLARED = 20n * MIB;
const MAX = 100n * MIB;
const LAYOUT = planParts(DECLARED, PART);

const part = (partNumber: number, sizeBytes: bigint) => ({ partNumber, sizeBytes });
const ALL = [part(1, PART), part(2, PART), part(3, 4n * MIB)];

describe('assessParts', () => {
  it('CA-10: todas las partes con su tamaño: completa con la suma real', () => {
    expect(assessParts(DECLARED, LAYOUT, ALL, MAX)).toEqual({ ok: true, sizeBytes: DECLARED });
  });

  it('CA-10: falta una parte: incompleta', () => {
    expect(assessParts(DECLARED, LAYOUT, [part(1, PART), part(3, 4n * MIB)], MAX)).toEqual({
      ok: false,
      violation: 'incomplete',
    });
  });

  it('CA-5: una parte intermedia de otro tamaño: no coincide', () => {
    const parts = [part(1, PART), part(2, PART - 1n)];

    expect(assessParts(DECLARED, LAYOUT, parts, MAX)).toEqual({ ok: false, violation: 'mismatch' });
  });

  it('CA-5: una parte con número mayor que el total: no coincide', () => {
    expect(assessParts(DECLARED, LAYOUT, [...ALL, part(4, 1n)], MAX)).toEqual({
      ok: false,
      violation: 'mismatch',
    });
  });

  it('CA-5: la suma supera el máximo del plan: se valida antes que el resto', () => {
    const parts = [part(1, PART), part(2, PART + 1n)];

    expect(assessParts(DECLARED, LAYOUT, parts, 16n * MIB)).toEqual({
      ok: false,
      violation: 'too_large',
      sizeBytes: 16n * MIB + 1n,
      maxBytes: 16n * MIB,
    });
  });
});

describe('assessObjectSize', () => {
  it('CA-12: del tamaño declarado: correcto', () => {
    expect(assessObjectSize(MIB, MIB, MAX)).toEqual({ ok: true, sizeBytes: MIB });
  });

  it('CA-7: 0 bytes: vacío, antes que cualquier otra regla', () => {
    expect(assessObjectSize(MIB, 0n, MAX)).toEqual({ ok: false, violation: 'empty' });
  });

  it('CA-5: más que el máximo del plan: demasiado grande', () => {
    expect(assessObjectSize(MIB, MAX + 1n, MAX)).toEqual({
      ok: false,
      violation: 'too_large',
      sizeBytes: MAX + 1n,
      maxBytes: MAX,
    });
  });

  it('CA-5: distinto del declarado: no coincide', () => {
    expect(assessObjectSize(MIB, MIB + 1n, MAX)).toEqual({ ok: false, violation: 'mismatch' });
  });
});
