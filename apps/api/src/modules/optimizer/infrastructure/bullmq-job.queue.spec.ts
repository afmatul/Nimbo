import type { Queue } from 'bullmq';

import { CorrelationContext } from '../../../shared';

import { BullmqJobQueue, ESTIMATE_JOB, OPTIMIZATION_QUEUE } from './bullmq-job.queue';

const MAX_ATTEMPTS = 3;
const TASK = {
  optimizationId: '22222222-2222-4222-8222-222222222222',
  fileId: '33333333-3333-4333-8333-333333333333',
  ownerId: '11111111-1111-4111-8111-111111111111',
} as const;

function setup() {
  const add = jest.fn().mockResolvedValue({ id: 'job-1' });
  const queue = { name: OPTIMIZATION_QUEUE, add } as unknown as Queue;
  return { add, jobQueue: new BullmqJobQueue(queue, { maxAttempts: MAX_ATTEMPTS }) };
}

describe('BullmqJobQueue (plan 021 §2, T-03)', () => {
  it('la cola es `optimization` y el trabajo de calcular, `estimate`', () => {
    expect([OPTIMIZATION_QUEUE, ESTIMATE_JOB]).toEqual(['optimization', 'estimate']);
  });

  it('un trabajo por optimización (`jobId` = `estimate-<id>`), con intentos, espera exponencial y el `correlationId`', async () => {
    const { add, jobQueue } = setup();

    await CorrelationContext.run({ correlationId: 'corr-1' }, () => jobQueue.enqueueEstimate(TASK));

    expect(add).toHaveBeenCalledWith(
      ESTIMATE_JOB,
      { ...TASK, correlationId: 'corr-1' },
      {
        jobId: `estimate-${TASK.optimizationId}`,
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it('encolar dos veces la misma optimización usa el mismo `jobId` (BullMQ no agrega otro mientras exista)', async () => {
    const { add, jobQueue } = setup();

    await jobQueue.enqueueEstimate(TASK);
    await jobQueue.enqueueEstimate(TASK);

    const jobIds = add.mock.calls.map(([, , options]) => (options as { jobId: string }).jobId);
    expect(new Set(jobIds).size).toBe(1);
  });

  it('T-04: run conserva intentos, backoff y contexto con un id distinto de estimate', async () => {
    const { add, jobQueue } = setup();
    await CorrelationContext.run({ correlationId: 'corr-run' }, () => jobQueue.enqueueRun(TASK));
    expect(add).toHaveBeenCalledWith(
      'run',
      { ...TASK, correlationId: 'corr-run' },
      {
        jobId: `run-${TASK.optimizationId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });
});
