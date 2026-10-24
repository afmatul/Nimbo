import type { Queue } from 'bullmq';

import { CorrelationContext, REPEATABLE_JOB_OPTIONS } from '../../../shared';

import { TrashPurgeQueue } from './trash-purge.queue';
import { TRASH_PURGE_JOB_NAME } from './trash-purge.scheduler';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';

describe('TrashPurgeQueue (006 CA-18, plan §4)', () => {
  it('CA-18: «Vaciar» encola una pasada inmediata con el `correlationId` de la petición y los mismos reintentos', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'job-1' });
    const queue = new TrashPurgeQueue({ add } as unknown as Queue);

    await CorrelationContext.run({ correlationId: CORRELATION_ID }, () => queue.enqueueNow());

    expect(add).toHaveBeenCalledWith(
      TRASH_PURGE_JOB_NAME,
      { correlationId: CORRELATION_ID },
      REPEATABLE_JOB_OPTIONS,
    );
  });
});
