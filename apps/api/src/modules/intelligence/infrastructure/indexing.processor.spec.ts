import type { Job } from 'bullmq';

import { CorrelationContext } from '../../../shared';
import type { IndexingService } from '../application/indexing.service';
import type { IntelligenceLogger } from '../application/intelligence-logger';
import type { IndexJob } from '../application/ports/i-index-queue.port';
import { EmbeddingUnavailableError } from '../domain/errors';

import { IndexingProcessor } from './indexing.processor';
import type { IndexJobData } from './indexing.processor';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const INDEX_JOB: IndexJob = {
  fileId: 'a1111111-1111-4111-8111-111111111111',
  versionId: 'b2222222-2222-4222-8222-222222222222',
  ownerId: 'c3333333-3333-4333-8333-333333333333',
};
const MAX_ATTEMPTS = 3;

interface Seen {
  readonly job: IndexJob;
  readonly correlationId: string | undefined;
  readonly jobId: string | undefined;
}

const jobOf = (data: IndexJobData, attemptsMade = 0) =>
  ({
    id: INDEX_JOB.versionId,
    data,
    attemptsMade,
    opts: { attempts: MAX_ATTEMPTS },
  }) as unknown as Job<IndexJobData>;

const setup = (giveUpError?: Error) => {
  const indexed: Seen[] = [];
  const givenUp: (Seen & { error: unknown })[] = [];
  const seen = (job: IndexJob): Seen => {
    const store = CorrelationContext.get();
    return { job, correlationId: store?.correlationId, jobId: store?.jobId };
  };
  const service = {
    indexVersion: (job: IndexJob) => {
      indexed.push(seen(job));
      return Promise.resolve();
    },
    giveUp: (job: IndexJob, error: unknown) => {
      givenUp.push({ ...seen(job), error });
      return giveUpError === undefined ? Promise.resolve() : Promise.reject(giveUpError);
    },
  } as unknown as IndexingService;
  const errors: Record<string, unknown>[] = [];
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: (payload: Record<string, unknown>) => errors.push(payload),
  } as unknown as IntelligenceLogger;
  return { processor: new IndexingProcessor(service, logger), indexed, givenUp, errors };
};

describe('IndexingProcessor', () => {
  it('CA-21: indexa solo los ids del trabajo, con su `correlationId` y su `jobId`', async () => {
    const { processor, indexed } = setup();

    await processor.process(jobOf({ ...INDEX_JOB, correlationId: CORRELATION_ID }));

    expect(indexed).toEqual([
      { job: INDEX_JOB, correlationId: CORRELATION_ID, jobId: INDEX_JOB.versionId },
    ]);
  });

  it('CA-21: un trabajo sin `correlationId` recibe uno nuevo', async () => {
    const { processor, indexed } = setup();

    await processor.process(jobOf(INDEX_JOB));

    expect(indexed[0]?.correlationId).toEqual(expect.any(String));
  });

  it('CA-12: con intentos restantes, un fallo no se da por vencido', async () => {
    const { processor, givenUp } = setup();

    await processor.onFailed(jobOf(INDEX_JOB, MAX_ATTEMPTS - 1), new Error('red'));

    expect(givenUp).toEqual([]);
  });

  it('CA-12: agotados los intentos, se da por vencido con el último error y en el contexto del trabajo', async () => {
    const { processor, givenUp } = setup();
    const error = new EmbeddingUnavailableError();

    await processor.onFailed(
      jobOf({ ...INDEX_JOB, correlationId: CORRELATION_ID }, MAX_ATTEMPTS),
      error,
    );

    expect(givenUp).toEqual([
      { job: INDEX_JOB, correlationId: CORRELATION_ID, jobId: INDEX_JOB.versionId, error },
    ]);
  });

  it('CA-12: sin trabajo (lo borró la cola) no hace nada', async () => {
    const { processor, givenUp } = setup();

    await processor.onFailed(undefined, new Error('red'));

    expect(givenUp).toEqual([]);
  });

  it('RN-12: si darse por vencido falla, se registra con ids y clase de error, sin rechazar', async () => {
    const { processor, errors } = setup(new TypeError('BD caída'));

    await processor.onFailed(jobOf(INDEX_JOB, MAX_ATTEMPTS), new Error('red'));

    expect(errors).toEqual([
      {
        event: 'indexing.give_up_failed',
        fileId: INDEX_JOB.fileId,
        versionId: INDEX_JOB.versionId,
        errorClass: 'TypeError',
      },
    ]);
  });
});
