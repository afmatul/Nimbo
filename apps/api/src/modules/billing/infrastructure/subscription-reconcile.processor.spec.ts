import type { Job } from 'bullmq';

import type { CorrelatedJobData } from '../../../shared';
import { CorrelationContext } from '../../../shared';
import type { SubscriptionReconcilerService } from '../application/subscription-reconciler.service';

import { SubscriptionReconcileProcessor } from './subscription-reconcile.processor';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const JOB_ID = 'repeat:subscription-reconcile:1';

const job = (data: Partial<CorrelatedJobData>) =>
  ({ id: JOB_ID, data }) as unknown as Job<CorrelatedJobData>;

const setup = () => {
  const stores: unknown[] = [];
  const reconcileAll = jest.fn(() => {
    stores.push(CorrelationContext.get());
    return Promise.resolve();
  });
  const reconciler = { reconcileAll } as unknown as SubscriptionReconcilerService;
  return { processor: new SubscriptionReconcileProcessor(reconciler), reconcileAll, stores };
};

describe('SubscriptionReconcileProcessor (spec 009 CA-2)', () => {
  it('CA-2: consume la cola `subscription-reconcile` con `concurrency: 1`', () => {
    expect(
      Reflect.getMetadata('bullmq:processor_metadata', SubscriptionReconcileProcessor),
    ).toEqual({ name: 'subscription-reconcile' });
    expect(Reflect.getMetadata('bullmq:worker_metadata', SubscriptionReconcileProcessor)).toEqual({
      concurrency: 1,
    });
  });

  it('CA-2: delega la pasada con el `correlationId` del trabajo y su `jobId`', async () => {
    const { processor, reconcileAll, stores } = setup();

    await processor.process(job({ correlationId: CORRELATION_ID }));

    expect(reconcileAll).toHaveBeenCalledTimes(1);
    expect(stores).toEqual([{ correlationId: CORRELATION_ID, jobId: JOB_ID }]);
  });
});
