import type { Queue } from 'bullmq';

import { CorrelationContext, REPEATABLE_JOB_OPTIONS } from '../../../shared';
import type { StorageLogger } from '../application/storage-logger';

import {
  TRASH_PURGE_JOB_NAME,
  TRASH_PURGE_QUEUE,
  TRASH_PURGE_SCHEDULER_ID,
  TrashPurgeScheduler,
} from './trash-purge.scheduler';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const MINUTE_MS = 60_000;

const setup = (intervalMinutes = 10) => {
  const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
  const queue = { upsertJobScheduler } as unknown as Queue;
  const info = jest.fn();
  const logger: StorageLogger = { info, warn: jest.fn(), error: jest.fn() };
  const scheduler = new TrashPurgeScheduler(queue, { intervalMinutes, batchSize: 100 }, logger);
  return { scheduler, upsertJobScheduler, info };
};

describe('TrashPurgeScheduler (006 CA-19, plan §4)', () => {
  it('CA-19: la cola se llama `trash-purge`', () => {
    expect(TRASH_PURGE_QUEUE).toBe('trash-purge');
  });

  it('CA-19: al arrancar registra el programa repetible cada `TRASH_PURGE_INTERVAL_MINUTES` con `{ correlationId }`', async () => {
    const { scheduler, upsertJobScheduler } = setup(7);

    await CorrelationContext.run({ correlationId: CORRELATION_ID }, () =>
      scheduler.onApplicationBootstrap(),
    );

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      TRASH_PURGE_SCHEDULER_ID,
      { every: 7 * MINUTE_MS },
      {
        name: TRASH_PURGE_JOB_NAME,
        data: { correlationId: CORRELATION_ID },
        opts: REPEATABLE_JOB_OPTIONS,
      },
    );
  });

  it('CA-19: cada ejecución tiene 3 intentos con espera exponencial', () => {
    expect(REPEATABLE_JOB_OPTIONS).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential' },
    });
  });

  it('CA-19: `upsert` es idempotente: un id fijo, así varias instancias comparten un solo programa', async () => {
    const first = setup();
    const second = setup();

    await first.scheduler.onApplicationBootstrap();
    await second.scheduler.onApplicationBootstrap();

    expect(first.upsertJobScheduler.mock.calls[0]?.[0]).toBe(
      second.upsertJobScheduler.mock.calls[0]?.[0],
    );
  });

  it('CA-19: registra `trash.purge_scheduled` con el intervalo', async () => {
    const { scheduler, info } = setup();

    await scheduler.onApplicationBootstrap();

    expect(info).toHaveBeenCalledWith({ event: 'trash.purge_scheduled', intervalMinutes: 10 });
  });
});
