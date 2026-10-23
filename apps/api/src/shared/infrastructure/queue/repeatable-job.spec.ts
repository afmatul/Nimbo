import type { Job, Queue } from 'bullmq';

import { CorrelationContext } from '../correlation/correlation-context';

import {
  REPEATABLE_JOB_OPTIONS,
  runWithJobCorrelation,
  scheduleRepeatableJob,
} from './repeatable-job';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';

describe('pasadas programadas del `worker` (PD-63)', () => {
  it('registra el programa con su id fijo, el intervalo en ms y solo el `correlationId`', async () => {
    const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
    const queue = { upsertJobScheduler } as unknown as Queue;

    await CorrelationContext.run({ correlationId: CORRELATION_ID }, () =>
      scheduleRepeatableJob(queue, { schedulerId: 'demo', jobName: 'run', intervalMinutes: 15 }),
    );

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'demo',
      { every: 15 * 60_000 },
      { name: 'run', data: { correlationId: CORRELATION_ID }, opts: REPEATABLE_JOB_OPTIONS },
    );
  });

  it('tres intentos con espera exponencial y los fallidos un día', () => {
    expect(REPEATABLE_JOB_OPTIONS).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86_400 },
    });
  });

  it('la pasada corre con el `correlationId` del trabajo y su `jobId`', async () => {
    const job = { id: '7', data: { correlationId: CORRELATION_ID } } as Job;

    await expect(
      runWithJobCorrelation(job, () => Promise.resolve(CorrelationContext.get())),
    ).resolves.toEqual({ correlationId: CORRELATION_ID, jobId: '7' });
  });
});
