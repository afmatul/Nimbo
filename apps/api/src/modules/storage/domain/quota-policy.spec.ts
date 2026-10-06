import { QuotaPolicy, type QuotaLimits, type QuotaUsage } from './quota-policy';

const LIMITS: QuotaLimits = { maxFileBytes: 100n, storageQuotaBytes: 1_000n };
const EMPTY: QuotaUsage = { usedBytes: 0n, reservedBytes: 0n };

describe('QuotaPolicy.check', () => {
  it('CA-1: un archivo dentro del máximo y de la cuota cabe', () => {
    expect(QuotaPolicy.check(LIMITS, EMPTY, 100n)).toEqual({ ok: true });
  });

  it('CA-3: un archivo mayor que el máximo por archivo es `FileTooLarge` con tamaño y máximo', () => {
    expect(QuotaPolicy.check(LIMITS, EMPTY, 101n)).toEqual({
      ok: false,
      violation: 'FileTooLarge',
      sizeBytes: 101n,
      maxBytes: 100n,
    });
  });

  it('CA-3: el máximo por archivo se evalúa antes que la cuota', () => {
    const full: QuotaUsage = { usedBytes: 1_000n, reservedBytes: 0n };

    expect(QuotaPolicy.check(LIMITS, full, 500n)).toMatchObject({ violation: 'FileTooLarge' });
  });

  it('CA-4: usado + reservado + declarado > cuota es `QuotaExceeded` con los bytes que faltan', () => {
    const usage: QuotaUsage = { usedBytes: 900n, reservedBytes: 50n };

    expect(QuotaPolicy.check(LIMITS, usage, 80n)).toEqual({
      ok: false,
      violation: 'QuotaExceeded',
      missingBytes: 30n,
    });
  });

  it('CA-4: llenar la cuota exacta está permitido', () => {
    const usage: QuotaUsage = { usedBytes: 900n, reservedBytes: 0n };

    expect(QuotaPolicy.check(LIMITS, usage, 100n)).toEqual({ ok: true });
  });

  it('CA-23: la segunda carga concurrente no cabe porque la primera ya reservó', () => {
    const first = QuotaPolicy.check(LIMITS, { usedBytes: 920n, reservedBytes: 0n }, 80n);
    const second = QuotaPolicy.check(LIMITS, { usedBytes: 920n, reservedBytes: 80n }, 80n);

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false, violation: 'QuotaExceeded', missingBytes: 80n });
  });

  it('RN-1: los límites llegan como argumentos (otros límites, otra decisión)', () => {
    const larger: QuotaLimits = { maxFileBytes: 1_000n, storageQuotaBytes: 10_000n };

    expect(QuotaPolicy.check(larger, EMPTY, 500n)).toEqual({ ok: true });
  });
});

describe('QuotaPolicy.available', () => {
  it('CA-1: disponible es la cuota menos lo usado y lo reservado', () => {
    const usage: QuotaUsage = { usedBytes: 600n, reservedBytes: 150n };

    expect(QuotaPolicy.available(LIMITS, usage)).toBe(250n);
  });

  it('CA-1: con la cuota llena el disponible es cero', () => {
    expect(QuotaPolicy.available(LIMITS, { usedBytes: 900n, reservedBytes: 100n })).toBe(0n);
  });

  it('CA-1: nunca es negativo aunque lo usado pase de la cuota (plan reducido)', () => {
    expect(QuotaPolicy.available(LIMITS, { usedBytes: 1_200n, reservedBytes: 50n })).toBe(0n);
  });

  it('CA-1: misma base que `check`: cabe exactamente lo disponible y un byte más no', () => {
    const usage: QuotaUsage = { usedBytes: 600n, reservedBytes: 150n };
    const roomy: QuotaLimits = { ...LIMITS, maxFileBytes: 1_000n };
    const available = QuotaPolicy.available(roomy, usage);

    expect(QuotaPolicy.check(roomy, usage, available)).toEqual({ ok: true });
    expect(QuotaPolicy.check(roomy, usage, available + 1n)).toMatchObject({
      violation: 'QuotaExceeded',
    });
  });
});
