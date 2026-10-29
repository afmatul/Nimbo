import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { FileTooLargeError, QuotaExceededError } from '../domain/errors';
import type { QuotaUsage } from '../domain/quota-policy';

import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { QuotaService } from './quota.service';

const NOW = new Date('2026-09-30T10:00:00.000Z');
const ACTOR: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const MAX_FILE = 50_000_000n;
const QUOTA = 100_000_000n;

/** Doble del repositorio: anota las llamadas y devuelve el uso que la prueba fija. */
class FakeQuotaRepository implements IQuotaRepository {
  readonly calls: string[] = [];
  readonly readAt: Date[] = [];

  constructor(private readonly usage: QuotaUsage) {}

  lockUsage(): Promise<bigint> {
    this.calls.push('lockUsage');
    return Promise.resolve(this.usage.usedBytes);
  }

  readUsage(): Promise<QuotaUsage> {
    this.calls.push('readUsage');
    return Promise.resolve(this.usage);
  }

  lockAndReadUsage(actor: Actor, now: Date): Promise<QuotaUsage> {
    this.calls.push(`lockAndReadUsage:${actor.id}`);
    this.readAt.push(now);
    return Promise.resolve(this.usage);
  }

  addUsedBytes(): Promise<void> {
    this.calls.push('addUsedBytes');
    return Promise.resolve();
  }
}

async function setup(usage: QuotaUsage) {
  const quotas = new FakeQuotaRepository(usage);
  const plans = new FakePlanLimitsProvider({
    maxFileBytes: MAX_FILE,
    storageQuotaBytes: QUOTA,
    trashRetentionDays: 30,
    retainedVersions: 3,
    readOnly: false,
    maxEditors: 0,
    extraQuotaBytes: 0n,
    extraQuotaUntil: null,
    planName: 'Plan de prueba',
  });
  const service = new QuotaService(quotas, new FixedClock(NOW));
  const limits = await plans.limitsFor(ACTOR);
  return { quotas, service, limits };
}

describe('QuotaService', () => {
  it('CA-4: cabe si lo usado más lo reservado más lo declarado no pasa de la cuota', async () => {
    const { quotas, service, limits } = await setup({
      usedBytes: 60_000_000n,
      reservedBytes: 20_000_000n,
    });

    await expect(service.assertCanUpload(ACTOR, 20_000_000n, limits)).resolves.toBeUndefined();

    expect(quotas.calls).toEqual([`lockAndReadUsage:${ACTOR.id}`]);
    expect(quotas.readAt).toEqual([NOW]);
  });

  it('CA-3: el máximo por archivo se valida antes que la cuota', async () => {
    const { service, limits } = await setup({ usedBytes: QUOTA, reservedBytes: 0n });

    const attempt = service.assertCanUpload(ACTOR, MAX_FILE + 1n, limits);

    await expect(attempt).rejects.toBeInstanceOf(FileTooLargeError);
    await expect(attempt).rejects.toMatchObject({
      details: { sizeBytes: Number(MAX_FILE + 1n), maxBytes: Number(MAX_FILE) },
    });
  });

  it('CA-23: las reservas activas cuentan y el error dice cuánto falta', async () => {
    const { service, limits } = await setup({ usedBytes: 60_000_000n, reservedBytes: 30_000_000n });

    const attempt = service.assertCanUpload(ACTOR, 20_000_000n, limits);

    await expect(attempt).rejects.toBeInstanceOf(QuotaExceededError);
    await expect(attempt).rejects.toMatchObject({ details: { missingBytes: 10_000_000 } });
  });

  it('CA-4: no escribe `espacio_usado` ni abre transacción propia (corre en la del llamador)', async () => {
    const { quotas, service, limits } = await setup({ usedBytes: 0n, reservedBytes: 0n });

    await service.assertCanUpload(ACTOR, 1n, limits);

    expect(quotas.calls).not.toContain('addUsedBytes');
    expect(quotas.calls).not.toContain('lockUsage');
  });
});

describe('QuotaService.assertFits (014 RN-9)', () => {
  it('CA-11: valida solo la cuota: un tamaño sobre el máximo por archivo que cabe pasa', async () => {
    const { quotas, service, limits } = await setup({ usedBytes: 0n, reservedBytes: 0n });

    await expect(
      service.assertFits(ACTOR, { bytes: MAX_FILE + 1n, purpose: 'restore' }, limits),
    ).resolves.toBeUndefined();

    expect(quotas.calls).toEqual([`lockAndReadUsage:${ACTOR.id}`]);
  });

  it('CA-11: lo usado más lo reservado más los bytes no cabe: 422 con lo que falta', async () => {
    const { service, limits } = await setup({ usedBytes: 90_000_000n, reservedBytes: 5_000_000n });

    const attempt = service.assertFits(ACTOR, { bytes: 6_000_000n, purpose: 'restore' }, limits);

    await expect(attempt).rejects.toBeInstanceOf(QuotaExceededError);
    await expect(attempt).rejects.toMatchObject({
      details: { missingBytes: 1_000_000 },
      message: expect.stringContaining('para restaurar esta versión') as unknown,
    });
  });
});
