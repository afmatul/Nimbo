import type { Queue } from 'bullmq';

import { CorrelationContext } from '../../../shared';

import { BullmqIndexQueue, INDEXING_JOB, INDEXING_QUEUE } from './bullmq-index.queue';

const MAX_ATTEMPTS = 3;
const RETRIED_AT = new Date('2026-10-22T09:30:00.000Z');
const JOB = {
  fileId: '33333333-3333-4333-8333-333333333333',
  versionId: '44444444-4444-4444-8444-444444444444',
  ownerId: '11111111-1111-4111-8111-111111111111',
} as const;

const OPTIONS = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: true,
  removeOnFail: true,
};

function setup() {
  const add = jest.fn().mockResolvedValue({ id: 'job-1' });
  const queue = { name: INDEXING_QUEUE, add } as unknown as Queue;
  return { add, indexQueue: new BullmqIndexQueue(queue, { maxAttempts: MAX_ATTEMPTS }) };
}

describe('BullmqIndexQueue (019 plan §1 y §7 punto 8)', () => {
  it('CA-9: un trabajo por versión (`jobId` = versión), con intentos, espera exponencial y el `correlationId`', async () => {
    const { add, indexQueue } = setup();

    await CorrelationContext.run({ correlationId: 'corr-1' }, () => indexQueue.enqueue(JOB));

    expect(add).toHaveBeenCalledWith(
      INDEXING_JOB,
      { ...JOB, correlationId: 'corr-1' },
      { ...OPTIONS, jobId: JOB.versionId },
    );
  });

  it('CA-13: el reintento es otro trabajo, propio de esa transición, para que el que dejó `fallido` no lo absorba', async () => {
    const { add, indexQueue } = setup();

    await CorrelationContext.run({ correlationId: 'corr-2' }, () =>
      indexQueue.enqueueRetry(JOB, RETRIED_AT),
    );

    expect(add).toHaveBeenCalledWith(
      INDEXING_JOB,
      { ...JOB, correlationId: 'corr-2' },
      { ...OPTIONS, jobId: `${JOB.versionId}-retry-${String(RETRIED_AT.getTime())}` },
    );
  });
});
