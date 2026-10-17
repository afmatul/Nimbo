import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeQuotaRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { SpaceBreakdown } from '../domain/space-breakdown';

import type { PlanLimits } from './plan-limits';
import type { SpaceMeasurer } from './space-measurer';
import { SpaceSummaryService } from './space-summary.service';

const NOW = new Date('2026-10-01T10:00:00.000Z');
const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const LIMITS: PlanLimits = {
  planName: 'Plan de prueba',
  maxFileBytes: 100n,
  storageQuotaBytes: 1000n,
  trashRetentionDays: 30,
  retainedVersions: 3,
};
const BREAKDOWN = SpaceBreakdown.fromBytesByKind(
  new Map([
    ['pdf', 400n],
    ['imagen', 100n],
  ]),
  50n,
);

function setup(limits: PlanLimits = LIMITS) {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal);
  quotas.usage = { usedBytes: 550n, reservedBytes: 120n };
  const readUsage = jest.spyOn(quotas, 'readUsage');
  const plans = new FakePlanLimitsProvider(limits);
  const limitsFor = plans.limitsFor.bind(plans);
  jest.spyOn(plans, 'limitsFor').mockImplementation((actor) => {
    journal.add('plans:limitsFor');
    return limitsFor(actor);
  });
  const measure = jest.fn((_actor: Actor) => {
    journal.add('space:measure');
    return Promise.resolve(BREAKDOWN);
  });
  const service = new SpaceSummaryService(transactions, quotas, plans, new FixedClock(NOW), {
    measure,
  } as unknown as SpaceMeasurer);
  return { journal, plans, readUsage, measure, service };
}

describe('SpaceSummaryService', () => {
  it('CA-1, CA-6: devuelve el plan, lo usado, lo reservado, la cuota, el máximo por archivo y la retención', async () => {
    const { service } = setup();

    const summary = await service.summary(ANA);

    expect(summary).toEqual({
      planName: 'Plan de prueba',
      usedBytes: 550n,
      reservedBytes: 120n,
      quotaBytes: 1000n,
      availableBytes: 330n,
      maxFileBytes: 100n,
      trashRetentionDays: 30,
      breakdown: BREAKDOWN,
    });
  });

  it('CA-1, D-5: lo disponible nunca es negativo aunque lo usado y lo reservado pasen de la cuota', async () => {
    const { service } = setup({ ...LIMITS, storageQuotaBytes: 600n });

    const summary = await service.summary(ANA);

    expect(summary.availableBytes).toBe(0n);
  });

  it('D-1, D-15: pide los límites fuera de la transacción y lee el uso sin bloqueo y la medición dentro', async () => {
    const { journal, plans, readUsage, measure, service } = setup();

    await service.summary(ANA);

    expect(plans.requestedFor).toEqual([ANA.id]);
    expect(journal.entries).toEqual([
      'plans:limitsFor',
      'tx:begin',
      'quota:readUsage',
      'space:measure',
      'tx:end',
    ]);
    expect(readUsage).toHaveBeenCalledWith(ANA, NOW);
    expect(measure).toHaveBeenCalledWith(ANA);
  });
});
