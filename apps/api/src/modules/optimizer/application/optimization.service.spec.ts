import { randomUUID } from 'node:crypto';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import { FakeJobQueue, FakeJobRepository } from '../../../../test/support/optimizer-fakes';
import {
  FakeRateLimiter,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { createActor, FixedClock, RateLimitExceededError, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AccountReadOnlyError, NodeNotFoundError, WritableAccountPolicy } from '../../storage';
import type { OptimizableFile } from '../../storage';
import { EstimateStaleError, UnsupportedTypeError } from '../domain/errors';
import { OptimizationJob } from '../domain/optimization-job';

import { OptimizationService } from './optimization.service';
import type { OptimizationFiles, OptimizerConfig } from './optimization.service';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NOW = new Date('2026-10-26T12:00:00.000Z');
const CONFIG: OptimizerConfig = {
  maxFileBytes: 40_000_000n,
  staleAfterMs: 20 * 60 * 1000,
  pollIntervalMs: 3000,
  requestsPerMinute: 10,
};
const LIMITS = {
  planName: 'Plan de prueba',
  maxFileBytes: 1_000_000_000n,
  storageQuotaBytes: 10_000_000_000n,
  extraQuotaBytes: 0n,
  extraQuotaUntil: null,
  trashRetentionDays: 7,
  retainedVersions: 3,
  maxEditors: 3,
  readOnly: false,
};

const imageOf = (overrides: Partial<OptimizableFile> = {}): OptimizableFile => ({
  id: randomUUID(),
  ownerId: ANA.id,
  kind: 'imagen',
  mime: 'image/jpeg',
  extension: 'jpg',
  sizeBytes: 4_800_000n,
  currentVersionId: randomUUID(),
  ...overrides,
});

/** La fachada de `storage` con un solo archivo visible para su dueño. */
class FakeOptimizationFiles implements OptimizationFiles {
  /** Versión vigente al bloquear; `null` = la del archivo leído (una carrera la cambia después de leerlo). */
  currentAtLock: string | null = null;

  constructor(
    public file: OptimizableFile | null,
    private readonly journal: Journal,
  ) {}

  findOwnedImage(actor: Actor, fileId: string): Promise<OptimizableFile | null> {
    return Promise.resolve(this.visible(actor, fileId));
  }

  findOwned(actor: Actor, fileId: string): Promise<OptimizableFile | null> {
    return Promise.resolve(this.visible(actor, fileId));
  }

  lockCurrentVersion(actor: Actor, ref: { fileId: string; versionId: string }): Promise<boolean> {
    this.journal.add('files:lockCurrentVersion');
    const file = this.visible(actor, ref.fileId);
    return Promise.resolve(
      file !== null && (this.currentAtLock ?? file.currentVersionId) === ref.versionId,
    );
  }

  private visible(actor: Actor, fileId: string): OptimizableFile | null {
    return this.file?.id === fileId && this.file.ownerId === actor.id ? this.file : null;
  }
}

function setup(file: OptimizableFile | null = imageOf(), now = NOW) {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const jobs = new FakeJobRepository(journal);
  const queue = new FakeJobQueue(journal);
  const rateLimiter = new FakeRateLimiter(journal);
  const limits = new FakePlanLimitsProvider(LIMITS);
  const files = new FakeOptimizationFiles(file, journal);
  const clock = new FixedClock(now);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new OptimizationService(
    transactions,
    files,
    jobs,
    queue,
    rateLimiter,
    limits,
    clock,
    CONFIG,
    logger,
    new WritableAccountPolicy(limits),
    { record: jest.fn().mockResolvedValue(undefined), recordInTransaction: jest.fn() },
  );
  return { journal, jobs, queue, rateLimiter, limits, files, service };
}

/** Una optimización de `file` en `state`, creada `minutesAgo` minutos antes de `NOW`. */
const seeded = (
  file: OptimizableFile,
  state: 'estimando' | 'estimada' | 'no_conviene' | 'fallida' | 'completada',
  minutesAgo = 1,
  sourceVersionId = file.currentVersionId,
): OptimizationJob => {
  const at = new Date(NOW.getTime() - minutesAgo * 60_000);
  const base = OptimizationJob.startEstimate({
    id: randomUUID(),
    fileId: file.id,
    sourceVersionId,
    originalBytes: file.sizeBytes,
    now: at,
  }).snapshot();
  const reason = state === 'fallida' ? 'integridad' : null;
  const estimatedBytes = state === 'estimada' ? 2_900_000n : null;
  return OptimizationJob.rehydrate({
    ...base,
    state,
    reason,
    estimatedBytes,
    ...(state === 'completada'
      ? { resultVersionId: randomUUID(), estimatedBytes: 2_900_000n, resultBytes: 2_900_000n }
      : {}),
  });
};

describe('OptimizationService.estimate (plan 021 §4, T-02)', () => {
  it.each([
    ['un JPEG', 'image/jpeg', 'jpg'],
    ['un PNG', 'image/png', 'png'],
  ])(
    'CA-1: %s propio y vivo queda `estimando` sobre su versión vigente',
    async (_case, mime, extension) => {
      const file = imageOf({ mime, extension });
      const { service, jobs } = setup(file);

      const { job } = await service.estimate(ANA, file.id);

      expect(job.snapshot()).toMatchObject({
        fileId: file.id,
        sourceVersionId: file.currentVersionId,
        state: 'estimando',
        originalBytes: file.sizeBytes,
        createdAt: NOW,
      });
      expect(jobs.jobs.size).toBe(1);
    },
  );

  it.each([
    ['un GIF', { mime: 'image/gif', extension: 'gif' }],
    ['un WebP', { mime: 'image/webp', extension: 'webp' }],
    ['un PDF', { kind: 'pdf', mime: 'application/pdf', extension: 'pdf' }],
    ['un `.docx`', { kind: 'docx', mime: 'application/zip', extension: 'docx' }],
    ['«otros»', { kind: 'otro', mime: null, extension: 'bin' }],
  ] as const)(
    'CA-3: %s es `422 OPTIMIZER_UNSUPPORTED_TYPE` y no crea nada',
    async (_case, overrides) => {
      const file = imageOf(overrides);
      const { service, jobs } = setup(file);

      await expect(service.estimate(ANA, file.id)).rejects.toBeInstanceOf(UnsupportedTypeError);
      expect(jobs.jobs.size).toBe(0);
    },
  );

  it('CA-4: una extensión de imagen cuyo contenido real no lo es (`mime: null`) es `422` y no crea nada', async () => {
    const file = imageOf({ mime: null, extension: 'png' });
    const { service, jobs } = setup(file);

    await expect(service.estimate(ANA, file.id)).rejects.toBeInstanceOf(UnsupportedTypeError);
    expect(jobs.jobs.size).toBe(0);
  });

  it('CA-18, CA-19: un archivo ajeno, en la papelera o inexistente es el mismo `404` de nodo', async () => {
    const { service, jobs } = setup(null);

    await expect(service.estimate(ANA, randomUUID())).rejects.toBeInstanceOf(NodeNotFoundError);
    expect(jobs.jobs.size).toBe(0);
  });

  it('CA-5: por encima del tope de bytes queda `no_disponible(tamano)`, final, sin esperar al `worker`', async () => {
    const file = imageOf({ sizeBytes: CONFIG.maxFileBytes + 1n });
    const { service } = setup(file);

    const { job } = await service.estimate(ANA, file.id);

    expect(job.state).toBe('no_disponible');
    expect(job.reason).toBe('tamano');
  });

  it('justo en el tope de bytes todavía se calcula', async () => {
    const file = imageOf({ sizeBytes: CONFIG.maxFileBytes });
    const { service } = setup(file);

    expect((await service.estimate(ANA, file.id)).job.state).toBe('estimando');
  });

  it('CA-17: en solo lectura calcular se permite (no consulta la política)', async () => {
    const file = imageOf();
    const { service, limits } = setup(file);
    limits.setReadOnly(true);

    expect((await service.estimate(ANA, file.id)).job.state).toBe('estimando');
  });

  it('RN-9: con una optimización en curso devuelve esa misma, sin crear otra', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    const running = jobs.seed(seeded(file, 'estimando'));

    const { job } = await service.estimate(ANA, file.id);

    expect(job.id).toBe(running.id);
    expect(jobs.jobs.size).toBe(1);
  });

  it('si otro pedido gana la carrera por la fila en curso, devuelve la de ese pedido', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    const winner = seeded(file, 'estimando');
    jest.spyOn(jobs, 'insertIfNoneInProgress').mockImplementationOnce(() => {
      jobs.seed(winner);
      return Promise.resolve(false);
    });

    const { job } = await service.estimate(ANA, file.id);

    expect(job.id).toBe(winner.id);
  });

  it('una estimación ya resuelta de la versión vigente se reutiliza: una sola estimación vigente por versión', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    const estimated = jobs.seed(seeded(file, 'estimada'));

    const { job } = await service.estimate(ANA, file.id);

    expect(job.id).toBe(estimated.id);
    expect(jobs.jobs.size).toBe(1);
  });

  it('una estimación de una versión anterior no sirve: se pide otra sobre la vigente', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    jobs.seed(seeded(file, 'estimada', 1, randomUUID()));

    const { job } = await service.estimate(ANA, file.id);

    expect(job.state).toBe('estimando');
    expect(job.snapshot().sourceVersionId).toBe(file.currentVersionId);
    expect(jobs.jobs.size).toBe(2);
  });

  it('CA-14: tras una `fallida` se puede volver a pedir', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    jobs.seed(seeded(file, 'fallida'));

    expect((await service.estimate(ANA, file.id)).job.state).toBe('estimando');
    expect(jobs.jobs.size).toBe(2);
  });

  it('caducidad perezosa: una en curso más vieja que la ventana pasa a `fallida(servicio_no_disponible)` y se pide otra', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    const lost = jobs.seed(seeded(file, 'estimando', 21));

    const { job } = await service.estimate(ANA, file.id);

    expect(jobs.jobs.get(lost.id)?.snapshot()).toMatchObject({
      state: 'fallida',
      reason: 'servicio_no_disponible',
      updatedAt: NOW,
    });
    expect(job.id).not.toBe(lost.id);
    expect(job.state).toBe('estimando');
  });

  it('RNF-07: el límite de tasa se aplica antes de resolver el archivo (sin oráculo)', async () => {
    const { service, rateLimiter, journal } = setup(null);
    rateLimiter.decision = { allowed: false, retryAfterSeconds: 30 };

    await expect(service.estimate(ANA, randomUUID())).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
    expect(rateLimiter.calls).toEqual([
      {
        key: `optimizer:request:${ANA.id}`,
        rules: [{ limit: CONFIG.requestsPerMinute, windowSeconds: 60 }],
      },
    ]);
    expect(journal.entries).not.toContain('jobs:latestOf');
  });
});

describe('OptimizationService.status (plan 021 §4, T-02)', () => {
  it('sin optimizaciones responde `null`', async () => {
    const file = imageOf();
    const { service } = setup(file);

    expect(await service.status(ANA, file.id)).toBeNull();
  });

  it('devuelve la última, con `pollAfterMs` mientras está en curso', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    jobs.seed(seeded(file, 'fallida', 5));
    const latest = jobs.seed(seeded(file, 'estimando', 1));

    const status = await service.status(ANA, file.id);

    expect(status?.job.id).toBe(latest.id);
    expect(status?.pollAfterMs).toBe(CONFIG.pollIntervalMs);
    expect(status?.keepOriginalDays).toBeNull();
  });

  it('un estado final no pide volver a consultar', async () => {
    const file = imageOf();
    const { service, jobs, files } = setup(file);
    const completed = jobs.seed(seeded(file, 'completada'));
    files.file = { ...file, currentVersionId: completed.resultVersionId ?? '' };

    const status = await service.status(ANA, file.id);

    expect(status?.job.state).toBe('completada');
    expect(status?.pollAfterMs).toBeNull();
  });

  it('`estimada` de la versión vigente trae los días de conservación del plan para el diálogo', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    jobs.seed(seeded(file, 'estimada'));

    const status = await service.status(ANA, file.id);

    expect(status?.keepOriginalDays).toBe(LIMITS.trashRetentionDays);
  });

  it('una estimación de una versión que ya no es la vigente es obsoleta: `null` (vuelve a «sin estimación»)', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    jobs.seed(seeded(file, 'no_conviene', 1, randomUUID()));

    expect(await service.status(ANA, file.id)).toBeNull();
  });

  it('caducidad perezosa antes de responder: una en curso perdida se ve `fallida(servicio_no_disponible)`', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    jobs.seed(seeded(file, 'estimando', 21));

    const status = await service.status(ANA, file.id);

    expect(status?.job.state).toBe('fallida');
    expect(status?.job.reason).toBe('servicio_no_disponible');
    expect(status?.pollAfterMs).toBeNull();
  });

  it('CA-18, CA-19: un archivo ajeno, en la papelera o inexistente es `404` de nodo', async () => {
    const { service } = setup(null);

    await expect(service.status(ANA, randomUUID())).rejects.toBeInstanceOf(NodeNotFoundError);
  });
});

describe('OptimizationService.estimate encola el cálculo (plan 021 §2, T-03)', () => {
  it('CA-1: una optimización nueva en `estimando` se encola con su id, después del commit', async () => {
    const file = imageOf();
    const { service, queue, journal } = setup(file);

    const { job } = await service.estimate(ANA, file.id);

    expect(queue.estimates).toEqual([{ optimizationId: job.id, fileId: file.id, ownerId: ANA.id }]);
    expect(journal.entries.lastIndexOf('tx:end')).toBeLessThan(journal.indexOf('queue:estimate'));
  });

  it('repetir el pedido mientras se calcula vuelve a encolar **la misma** optimización (mismo trabajo, sin fila nueva)', async () => {
    const file = imageOf();
    const { service, queue, jobs } = setup(file);

    const first = await service.estimate(ANA, file.id);
    const second = await service.estimate(ANA, file.id);

    expect(second.job.id).toBe(first.job.id);
    expect(jobs.jobs.size).toBe(1);
    expect(queue.estimates.map((task) => task.optimizationId)).toEqual([
      first.job.id,
      first.job.id,
    ]);
  });

  it('CA-5: `no_disponible(tamano)` nace final y no se encola', async () => {
    const file = imageOf({ sizeBytes: 40_000_001n });
    const { service, queue } = setup(file);

    await service.estimate(ANA, file.id);

    expect(queue.estimates).toEqual([]);
  });

  it('una estimación ya resuelta de la versión vigente se reutiliza sin encolar', async () => {
    const file = imageOf();
    const { service, queue, jobs } = setup(file);
    jobs.seed(seeded(file, 'estimada'));

    await service.estimate(ANA, file.id);

    expect(queue.estimates).toEqual([]);
  });

  it('si la cola falla, el pedido falla y la fila queda `estimando`; repetirlo la vuelve a encolar', async () => {
    const file = imageOf();
    const { service, queue, jobs } = setup(file);
    queue.failure = new Error('redis caído');

    await expect(service.estimate(ANA, file.id)).rejects.toThrow('redis caído');
    const [pending] = [...jobs.jobs.values()];
    const retried = await service.estimate(ANA, file.id);

    expect(pending?.state).toBe('estimando');
    expect(retried.job.id).toBe(pending?.id);
    expect(queue.estimates.map((task) => task.optimizationId)).toEqual([pending?.id]);
  });
});

describe('OptimizationService.run (021 T-04)', () => {
  it('la última fila gana aunque una estimada anterior todavía describa la misma versión', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    const older = jobs.seed(seeded(file, 'estimada', 2));
    jobs.seed(seeded(file, 'fallida', 1));
    await expect(
      service.run(ANA, { fileId: file.id, optimizationId: older.id }),
    ).rejects.toBeInstanceOf(EstimateStaleError);
  });

  it('un encolado fallido conserva optimizando y repetir no genera otro id de versión', async () => {
    const file = imageOf();
    const { service, jobs, queue } = setup(file);
    const estimated = jobs.seed(seeded(file, 'estimada'));
    const input = { fileId: file.id, optimizationId: estimated.id };
    queue.failure = new Error('Redis temporal');
    await expect(service.run(ANA, input)).rejects.toThrow('Redis temporal');
    const versionId = jobs.jobs.get(estimated.id)?.resultVersionId;
    const retried = await service.run(ANA, input);
    expect(retried.job.resultVersionId).toBe(versionId);
    expect(queue.runs).toHaveLength(1);
  });
  it('CA-6: una estimada vigente pasa a optimizando y encola tras el commit', async () => {
    const file = imageOf();
    const { service, jobs, queue, journal } = setup(file);
    const estimated = jobs.seed(seeded(file, 'estimada'));

    const view = await service.run(ANA, { fileId: file.id, optimizationId: estimated.id });

    expect(view.job.snapshot()).toMatchObject({
      state: 'optimizando',
      resultVersionId: expect.any(String),
    });
    expect(view).toMatchObject({ pollAfterMs: 3000, keepOriginalDays: null });
    expect(queue.runs).toEqual([
      { optimizationId: estimated.id, fileId: file.id, ownerId: ANA.id },
    ]);
    expect(journal.entries.lastIndexOf('tx:end')).toBeLessThan(journal.indexOf('queue:run'));
  });

  it('CA-11: bloquea la versión vigente en la misma transacción que el CAS', async () => {
    const file = imageOf();
    const { service, jobs, journal } = setup(file);
    const estimated = jobs.seed(seeded(file, 'estimada'));

    await service.run(ANA, { fileId: file.id, optimizationId: estimated.id });

    const lock = journal.indexOf('files:lockCurrentVersion');
    const cas = journal.indexOf('jobs:compareAndSet:optimizando');
    expect(lock).toBeGreaterThan(journal.entries.lastIndexOf('tx:begin', cas));
    expect(lock).toBeLessThan(cas);
    expect(journal.entries.indexOf('tx:end', lock)).toBeGreaterThan(cas);
  });

  it('CA-11 (carrera): una versión registrada después de leer el archivo es 409 sin CAS ni encolado', async () => {
    const file = imageOf();
    const { service, jobs, queue, files, journal } = setup(file);
    const estimated = jobs.seed(seeded(file, 'estimada'));
    files.currentAtLock = randomUUID();

    await expect(
      service.run(ANA, { fileId: file.id, optimizationId: estimated.id }),
    ).rejects.toBeInstanceOf(EstimateStaleError);

    expect(jobs.jobs.get(estimated.id)?.state).toBe('estimada');
    expect(journal.entries).not.toContain('jobs:compareAndSet:optimizando');
    expect(queue.runs).toEqual([]);
  });

  it('CA-12: dos llamadas concurrentes conservan el mismo id de versión', async () => {
    const file = imageOf();
    const { service, jobs } = setup(file);
    const estimated = jobs.seed(seeded(file, 'estimada'));
    const input = { fileId: file.id, optimizationId: estimated.id };

    const [first, second] = await Promise.all([service.run(ANA, input), service.run(ANA, input)]);

    expect(first.job.state).toBe('optimizando');
    expect(second.job.snapshot().resultVersionId).toBe(first.job.snapshot().resultVersionId);
    expect(jobs.jobs.size).toBe(1);
  });

  it('CA-17: solo lectura es 403 y no cambia la estimación ni encola', async () => {
    const file = imageOf();
    const { service, jobs, queue, limits } = setup(file);
    const estimated = jobs.seed(seeded(file, 'estimada'));
    limits.setReadOnly(true);

    await expect(
      service.run(ANA, { fileId: file.id, optimizationId: estimated.id }),
    ).rejects.toBeInstanceOf(AccountReadOnlyError);

    expect(jobs.jobs.get(estimated.id)?.state).toBe('estimada');
    expect(queue.runs).toEqual([]);
  });

  it.each(['otra optimización', 'versión cambiada', 'ya terminal', 'todavía estimando'])(
    'una estimación no vigente (%s) es 409 y no encola',
    async (scenario) => {
      const file = imageOf();
      const { service, jobs, queue } = setup(file);
      const state =
        scenario === 'ya terminal'
          ? 'fallida'
          : scenario === 'todavía estimando'
            ? 'estimando'
            : 'estimada';
      const job = jobs.seed(
        seeded(
          file,
          state,
          1,
          scenario === 'versión cambiada' ? randomUUID() : file.currentVersionId,
        ),
      );

      await expect(
        service.run(ANA, {
          fileId: file.id,
          optimizationId: scenario === 'otra optimización' ? randomUUID() : job.id,
        }),
      ).rejects.toBeInstanceOf(EstimateStaleError);
      expect(queue.runs).toEqual([]);
    },
  );

  it('ajeno/inexistente es 404 sin consultar su optimización', async () => {
    const { service } = setup(null);
    await expect(
      service.run(ANA, { fileId: randomUUID(), optimizationId: randomUUID() }),
    ).rejects.toBeInstanceOf(NodeNotFoundError);
  });

  it('tipo no soportado es 422 antes de abrir una ejecución', async () => {
    const file = imageOf({ mime: 'image/webp', extension: 'webp' });
    const { service } = setup(file);
    await expect(
      service.run(ANA, { fileId: file.id, optimizationId: randomUUID() }),
    ).rejects.toBeInstanceOf(UnsupportedTypeError);
  });

  it('calcular y ejecutar comparten el límite por cuenta', async () => {
    const file = imageOf();
    const { service, rateLimiter } = setup(file);
    rateLimiter.decision = { allowed: false, retryAfterSeconds: 30 };
    await expect(
      service.run(ANA, { fileId: file.id, optimizationId: randomUUID() }),
    ).rejects.toBeInstanceOf(RateLimitExceededError);
    expect(rateLimiter.calls[0]?.key).toBe(`optimizer:request:${ANA.id}`);
  });
});
