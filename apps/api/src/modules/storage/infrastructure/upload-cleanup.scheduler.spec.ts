import type { Queue } from 'bullmq';

import { CorrelationContext } from '../../../shared';
import type { StorageLogger } from '../application/storage-logger';

import {
  UPLOAD_CLEANUP_JOB_NAME,
  UPLOAD_CLEANUP_JOB_OPTIONS,
  UPLOAD_CLEANUP_QUEUE,
  UPLOAD_CLEANUP_SCHEDULER_ID,
  UploadCleanupScheduler,
} from './upload-cleanup.scheduler';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const MINUTE_MS = 60_000;

const setup = (intervalMinutes = 10) => {
  const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
  const queue = { upsertJobScheduler } as unknown as Queue;
  const info = jest.fn();
  const logger: StorageLogger = { info, warn: jest.fn(), error: jest.fn() };
  const scheduler = new UploadCleanupScheduler(queue, { intervalMinutes, batchSize: 100 }, logger);
  return { scheduler, upsertJobScheduler, info };
};

describe('UploadCleanupScheduler (CA-9, D-6)', () => {
  it('CA-9: la cola se llama `upload-cleanup`', () => {
    expect(UPLOAD_CLEANUP_QUEUE).toBe('upload-cleanup');
  });

  it('CA-9: al arrancar registra el programa repetible cada `UPLOAD_CLEANUP_INTERVAL_MINUTES` con `{ correlationId }`', async () => {
    const { scheduler, upsertJobScheduler } = setup(7);

    await CorrelationContext.run({ correlationId: CORRELATION_ID }, () =>
      scheduler.onApplicationBootstrap(),
    );

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      UPLOAD_CLEANUP_SCHEDULER_ID,
      { every: 7 * MINUTE_MS },
      {
        name: UPLOAD_CLEANUP_JOB_NAME,
        data: { correlationId: CORRELATION_ID },
        opts: UPLOAD_CLEANUP_JOB_OPTIONS,
      },
    );
  });

  it('CA-9: cada ejecución tiene 3 intentos con espera exponencial', () => {
    expect(UPLOAD_CLEANUP_JOB_OPTIONS).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential' },
    });
  });

  it('CA-9: `upsert` es idempotente: un id fijo, así varias instancias comparten un solo programa', async () => {
    const first = setup();
    const second = setup();

    await first.scheduler.onApplicationBootstrap();
    await second.scheduler.onApplicationBootstrap();

    expect(first.upsertJobScheduler.mock.calls[0]?.[0]).toBe(
      second.upsertJobScheduler.mock.calls[0]?.[0],
    );
  });

  it('CA-9: registra `upload.cleanup_scheduled` con el intervalo', async () => {
    const { scheduler, info } = setup();

    await scheduler.onApplicationBootstrap();

    expect(info).toHaveBeenCalledWith({ event: 'upload.cleanup_scheduled', intervalMinutes: 10 });
  });
});
