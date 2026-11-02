import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';

import { CorrelationContext } from '../../../shared';
import type { OptimizationRunner } from '../application/optimization-runner';
import type { OptimizationTask } from '../application/ports/i-job-queue.port';

import { OptimizationProcessor } from './optimization.processor';
import type { OptimizationJobData } from './optimization.processor';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const TASK: OptimizationTask = {
  optimizationId: 'a1111111-1111-4111-8111-111111111111',
  fileId: 'b2222222-2222-4222-8222-222222222222',
  ownerId: 'c3333333-3333-4333-8333-333333333333',
};
const MAX_ATTEMPTS = 3;
const JOB_ID = `estimate-${TASK.optimizationId}`;

interface Seen {
  readonly task: OptimizationTask;
  readonly correlationId: string | undefined;
  readonly jobId: string | undefined;
}

const jobOf = (data: OptimizationJobData, attemptsMade = 0, name = 'estimate') =>
  ({
    id: JOB_ID,
    name,
    data,
    attemptsMade,
    opts: { attempts: MAX_ATTEMPTS },
  }) as unknown as Job<OptimizationJobData>;

const setup = (giveUpError?: Error) => {
  const estimated: Seen[] = [];
  const executed: Seen[] = [];
  const givenUp: (Seen & { error: unknown })[] = [];
  const seen = (task: OptimizationTask): Seen => {
    const store = CorrelationContext.get();
    return { task, correlationId: store?.correlationId, jobId: store?.jobId };
  };
  const runner = {
    run: (task: OptimizationTask) => {
      executed.push(seen(task));
      return Promise.resolve();
    },
    estimate: (task: OptimizationTask) => {
      estimated.push(seen(task));
      return Promise.resolve();
    },
    giveUp: (task: OptimizationTask, error: unknown) => {
      givenUp.push({ ...seen(task), error });
      return giveUpError === undefined ? Promise.resolve() : Promise.reject(giveUpError);
    },
  } as unknown as OptimizationRunner;
  const errors: Record<string, unknown>[] = [];
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: (payload: unknown) => {
      errors.push(payload as Record<string, unknown>);
    },
  };
  return {
    processor: new OptimizationProcessor(runner, logger),
    estimated,
    executed,
    givenUp,
    errors,
  };
};

describe('OptimizationProcessor (plan 021 §2, T-03)', () => {
  it('CA-21: calcula solo con los ids del trabajo, con su `correlationId` y su `jobId`', async () => {
    const { processor, estimated } = setup();

    await processor.process(jobOf({ ...TASK, correlationId: CORRELATION_ID }));

    expect(estimated).toEqual([{ task: TASK, correlationId: CORRELATION_ID, jobId: JOB_ID }]);
  });

  it('un trabajo sin `correlationId` recibe uno nuevo', async () => {
    const { processor, estimated } = setup();

    await processor.process(jobOf(TASK));

    expect(estimated[0]?.correlationId).toEqual(expect.any(String));
  });

  it('un trabajo de nombre desconocido se rechaza sin calcular', async () => {
    const { processor, estimated } = setup();

    await expect(processor.process(jobOf(TASK, 0, 'desconocido'))).rejects.toThrow(TypeError);
    expect(estimated).toEqual([]);
  });

  it('T-04: despacha run con ids y contexto, sin ejecutar estimate', async () => {
    const { processor, estimated, executed } = setup();
    await processor.process(jobOf({ ...TASK, correlationId: CORRELATION_ID }, 0, 'run'));
    expect(executed).toEqual([{ task: TASK, correlationId: CORRELATION_ID, jobId: JOB_ID }]);
    expect(estimated).toEqual([]);
  });

  it('CA-14: con intentos restantes, un fallo no se da por vencido', async () => {
    const { processor, givenUp } = setup();

    await processor.onFailed(jobOf(TASK, MAX_ATTEMPTS - 1), new Error('timeout'));

    expect(givenUp).toEqual([]);
  });

  it.each([
    ['la clase', new UnrecoverableError('job stalled more than allowable limit')],
    [
      'el nombre (otra copia de bullmq)',
      Object.assign(new Error('x'), { name: 'UnrecoverableError' }),
    ],
  ])(
    'CA-14: un fallo terminal antes de agotar los intentos (atascado más de `maxStalledCount`, por %s) se da por vencido',
    async (_, error) => {
      const { processor, givenUp } = setup();

      await processor.onFailed(jobOf(TASK, 1), error);

      expect(givenUp).toEqual([
        { task: TASK, correlationId: expect.any(String), jobId: JOB_ID, error },
      ]);
    },
  );

  it('CA-14: agotados los intentos, se da por vencido con el último error y en el contexto del trabajo', async () => {
    const { processor, givenUp } = setup();
    const error = new Error('timeout');

    await processor.onFailed(
      jobOf({ ...TASK, correlationId: CORRELATION_ID }, MAX_ATTEMPTS),
      error,
    );

    expect(givenUp).toEqual([{ task: TASK, correlationId: CORRELATION_ID, jobId: JOB_ID, error }]);
  });

  it('sin trabajo (lo borró la cola) no hace nada', async () => {
    const { processor, givenUp } = setup();

    await processor.onFailed(undefined, new Error('timeout'));

    expect(givenUp).toEqual([]);
  });

  it('si darse por vencido falla, se registra con ids y clase de error, sin rechazar (la caducidad la cubre)', async () => {
    const { processor, errors } = setup(new TypeError('BD caída'));

    await processor.onFailed(jobOf(TASK, MAX_ATTEMPTS), new Error('timeout'));

    expect(errors).toEqual([
      {
        event: 'optimization.give_up_failed',
        fileId: TASK.fileId,
        optimizationId: TASK.optimizationId,
        errorClass: 'TypeError',
      },
    ]);
  });
});
