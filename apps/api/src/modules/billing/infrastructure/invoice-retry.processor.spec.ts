import type { Job } from 'bullmq';

import { CorrelationContext } from '../../../shared';
import type { InvoiceRetrier } from '../application/invoice-retrier';

import { InvoiceRetryProcessor } from './invoice-retry.processor';
import type { InvoiceRetryJobData } from './invoice-retry.scheduler';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const JOB_ID = 'repeat:invoice-retry:1';

const job = (data: Partial<InvoiceRetryJobData>) =>
  ({ id: JOB_ID, data }) as unknown as Job<InvoiceRetryJobData>;

const setup = () => {
  const stores: unknown[] = [];
  const retryPending = jest.fn(() => {
    stores.push(CorrelationContext.get());
    return Promise.resolve();
  });
  const retrier = { retryPending } as unknown as InvoiceRetrier;
  return { processor: new InvoiceRetryProcessor(retrier), retryPending, stores };
};

describe('InvoiceRetryProcessor (spec 009 CA-6, T-07)', () => {
  it('CA-6: consume la cola `invoice-retry` con `concurrency: 1`', () => {
    expect(Reflect.getMetadata('bullmq:processor_metadata', InvoiceRetryProcessor)).toEqual({
      name: 'invoice-retry',
    });
    expect(Reflect.getMetadata('bullmq:worker_metadata', InvoiceRetryProcessor)).toEqual({
      concurrency: 1,
    });
  });

  it('CA-6: delega la pasada con el `correlationId` del trabajo y su `jobId`', async () => {
    const { processor, retryPending, stores } = setup();

    await processor.process(job({ correlationId: CORRELATION_ID }));

    expect(retryPending).toHaveBeenCalledTimes(1);
    expect(stores).toEqual([{ correlationId: CORRELATION_ID, jobId: JOB_ID }]);
  });
});
