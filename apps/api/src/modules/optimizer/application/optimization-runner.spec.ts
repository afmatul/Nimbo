import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import {
  FakeJobRepository,
  FakeOptimizer,
  inspectionOf,
} from '../../../../test/support/optimizer-fakes';
import { FakeTransactionRunner, Journal } from '../../../../test/support/storage-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { FileVersionRef } from '../../storage';
import { UnreadableImageError } from '../domain/errors';
import { OptimizationJob } from '../domain/optimization-job';

import { OptimizationRunner } from './optimization-runner';
import type { OptimizationRunnerConfig, OptimizerFiles } from './optimization-runner';
import type { OptimizationTask } from './ports/i-job-queue.port';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const REQUESTED_AT = new Date('2026-10-26T12:00:00.000Z');
const NOW = new Date('2026-10-26T12:00:05.000Z');
const CONFIG: OptimizationRunnerConfig = {
  maxPixels: 36_000_000,
  threshold: { minBytes: 1_000_000n, minPercent: 20 },
};
const ORIGINAL_BYTES = 4_800_000n;
const CONTENT = Buffer.from('contenido de la versión de origen');

/** La fachada de `storage`: el contenido de la versión de origen mientras siga siendo la vigente. */
class FakeFiles implements OptimizerFiles {
  readonly opened: { actor: string; ref: FileVersionRef }[] = [];
  current: FileVersionRef | null = null;

  findOwned(): Promise<null> {
    return Promise.resolve(null);
  }
  findRegisteredOptimization(): Promise<null> {
    return Promise.resolve(null);
  }
  registerOptimizedVersion(): Promise<never> {
    return Promise.reject(new Error('No registra al estimar'));
  }

  openCurrent(actor: Actor, ref: FileVersionRef): Promise<Readable | null> {
    this.opened.push({ actor: actor.id, ref });
    const isCurrent =
      this.current?.fileId === ref.fileId && this.current.versionId === ref.versionId;
    return Promise.resolve(isCurrent ? Readable.from([CONTENT]) : null);
  }
}

function setup() {
  const journal = new Journal();
  const jobs = new FakeJobRepository(journal);
  const files = new FakeFiles();
  const optimizer = new FakeOptimizer();
  const clock = new FixedClock(NOW);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const integrity = {
    validate: jest.fn<Promise<boolean>, [Buffer, Buffer]>().mockResolvedValue(true),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined), recordInTransaction: jest.fn() };
  const runner = new OptimizationRunner(
    new FakeTransactionRunner(journal),
    files,
    jobs,
    optimizer,
    clock,
    CONFIG,
    logger,
    integrity,
    audit,
  );
  const job = jobs.seed(
    OptimizationJob.startEstimate({
      id: randomUUID(),
      fileId: randomUUID(),
      sourceVersionId: randomUUID(),
      originalBytes: ORIGINAL_BYTES,
      now: REQUESTED_AT,
    }),
  );
  files.current = { fileId: job.fileId, versionId: job.sourceVersionId };
  const task: OptimizationTask = { optimizationId: job.id, fileId: job.fileId, ownerId: ANA.id };
  const stored = () => jobs.jobs.get(job.id)?.snapshot();
  return { jobs, files, optimizer, clock, logger, runner, job, task, stored, integrity, audit };
}

const loggedEvents = (logger: { info: jest.Mock; warn: jest.Mock }) =>
  [...logger.info.mock.calls, ...logger.warn.mock.calls].map(
    ([entry]) => (entry as { event: string }).event,
  );

describe('OptimizationRunner.estimate (plan 021 §1, T-03)', () => {
  it('CA-21: estimar, incluso fallar su cálculo, no genera auditoría', async () => {
    const { runner, task, audit, integrity } = setup();
    integrity.validate.mockResolvedValueOnce(false);
    await runner.estimate(task);
    await runner.giveUp(task, new Error('reentrega'));
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('plan §6: una salida que viola la integridad nunca queda `estimada`, aunque ahorre: `fallida(integridad)`', async () => {
    const { runner, task, optimizer, stored, integrity } = setup();
    optimizer.resultBytes = 2_000_000;
    integrity.validate.mockResolvedValueOnce(false);

    await runner.estimate(task);

    expect(stored()).toMatchObject({
      state: 'fallida',
      reason: 'integridad',
      estimatedBytes: null,
    });
    expect(integrity.validate).toHaveBeenCalledWith(CONTENT, expect.any(Buffer));
  });

  it('CA-14: un timeout de validación reintenta sin publicar una estimación', async () => {
    const { runner, task, stored, integrity } = setup();
    const timeout = new Error('timeout: 61% complete');
    integrity.validate.mockRejectedValueOnce(timeout);

    await expect(runner.estimate(task)).rejects.toBe(timeout);

    expect(stored()).toMatchObject({ state: 'estimando', estimatedBytes: null });
  });

  it('CA-1: lee la versión de origen como la dueña, recomprime y deja `estimada` con los bytes estimados', async () => {
    const { runner, task, optimizer, files, stored, logger } = setup();
    optimizer.resultBytes = 2_900_000;

    await runner.estimate(task);

    expect(stored()).toMatchObject({
      state: 'estimada',
      reason: null,
      estimatedBytes: 2_900_000n,
      updatedAt: NOW,
    });
    expect(files.opened).toEqual([{ actor: ANA.id, ref: files.current }]);
    expect(optimizer.inspected).toEqual([CONTENT]);
    expect(optimizer.optimized).toEqual([CONTENT]);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'optimization.estimated',
      fileId: task.fileId,
      optimizationId: task.optimizationId,
      originalBytes: 4_800_000,
      estimatedBytes: 2_900_000,
    });
  });

  it('CA-2: si el ahorro no alcanza el umbral (bytes **y** porcentaje) queda `no_conviene`', async () => {
    const { runner, task, optimizer, stored, logger } = setup();
    // 900 kB (18,75 %): no alcanza ni 1 MB ni el 20 %.
    optimizer.resultBytes = 3_900_000;

    await runner.estimate(task);

    expect(stored()).toMatchObject({
      state: 'no_conviene',
      reason: null,
      estimatedBytes: 3_900_000n,
    });
    expect(loggedEvents(logger)).toContain('optimization.not_worth_it');
  });

  it('CA-2: un resultado mayor que el original queda `no_conviene`', async () => {
    const { runner, task, optimizer, stored } = setup();
    optimizer.resultBytes = 5_000_000;

    await runner.estimate(task);

    expect(stored()?.state).toBe('no_conviene');
  });

  it.each([
    ['más píxeles que el tope', inspectionOf({ pixels: 36_000_001 }), 'pixeles'],
    ['un PNG animado', inspectionOf({ format: 'png', animated: true }), 'animada'],
  ] as const)(
    'CA-5: %s queda `no_disponible(%s)` sin recomprimir',
    async (_case, inspection, reason) => {
      const { runner, task, optimizer, stored, logger } = setup();
      optimizer.inspection = inspection;

      await runner.estimate(task);

      expect(stored()).toMatchObject({ state: 'no_disponible', reason, estimatedBytes: null });
      expect(optimizer.optimized).toEqual([]);
      expect(loggedEvents(logger)).toContain('optimization.unavailable');
    },
  );

  it('RN-8: exactamente el tope de píxeles todavía se calcula', async () => {
    const { runner, task, optimizer, stored } = setup();
    optimizer.inspection = inspectionOf({ pixels: 36_000_000 });
    optimizer.resultBytes = 2_000_000;

    await runner.estimate(task);

    expect(stored()?.state).toBe('estimada');
  });

  it.each(['inspect', 'optimize'] as const)(
    'CA-5: una imagen ilegible al %s queda `no_disponible(ilegible)` sin reintento',
    async (step) => {
      const { runner, task, optimizer, stored } = setup();
      const unreadable = new UnreadableImageError(new Error('VipsJpeg: premature end'));
      if (step === 'inspect') optimizer.inspectFailure = unreadable;
      else optimizer.optimizeFailure = unreadable;

      await expect(runner.estimate(task)).resolves.toBeUndefined();

      expect(stored()).toMatchObject({ state: 'no_disponible', reason: 'ilegible' });
    },
  );

  it('CA-14: un fallo técnico (tiempo límite) se relanza para que la cola reintente; la fila queda reclamada', async () => {
    const { runner, task, optimizer, stored } = setup();
    optimizer.optimizeFailure = new Error('timeout: 61% complete');

    await expect(runner.estimate(task)).rejects.toThrow('timeout');

    expect(stored()).toMatchObject({ state: 'estimando', updatedAt: NOW });
  });

  it('plan §5: reclamar renueva `actualizado_en` antes de leer, así la caducidad no alcanza al trabajo vivo', async () => {
    const { runner, task, optimizer, stored } = setup();
    let seenWhileWorking: Date | undefined;
    optimizer.inspect = (content) => {
      seenWhileWorking = stored()?.updatedAt;
      return FakeOptimizer.prototype.inspect.call(optimizer, content);
    };

    await runner.estimate(task);

    expect(seenWhileWorking).toEqual(NOW);
  });

  it('un reintento retoma la misma fila (sin crear otra) y la resuelve', async () => {
    const { runner, task, optimizer, jobs, stored, clock } = setup();
    optimizer.optimizeFailure = new Error('timeout');
    await expect(runner.estimate(task)).rejects.toThrow();
    clock.advance(2000);
    optimizer.optimizeFailure = null;
    optimizer.resultBytes = 2_000_000;

    await runner.estimate(task);

    expect(jobs.jobs.size).toBe(1);
    expect(stored()?.state).toBe('estimada');
  });

  it('un trabajo repetido sobre una optimización ya resuelta no hace nada', async () => {
    const { runner, task, optimizer, stored } = setup();
    optimizer.resultBytes = 2_000_000;
    await runner.estimate(task);
    const settled = stored();

    await runner.estimate(task);

    expect(stored()).toEqual(settled);
    expect(optimizer.inspected).toHaveLength(1);
  });

  it('si otro `worker` la reclamó mientras tanto, su resultado no pisa el del otro (comparar y asignar)', async () => {
    const { runner, task, optimizer, jobs, job, stored } = setup();
    const later = new Date(NOW.getTime() + 1000);
    optimizer.optimize = () => {
      jobs.seed(job.claim(later));
      return Promise.resolve(Buffer.alloc(2_000_000));
    };

    await runner.estimate(task);

    expect(stored()).toMatchObject({ state: 'estimando', updatedAt: later });
  });

  it('no toma un trabajo cuyo archivo no es el de la optimización', async () => {
    const { runner, task, optimizer, stored } = setup();

    await runner.estimate({ ...task, fileId: randomUUID() });

    expect(stored()?.state).toBe('estimando');
    expect(optimizer.inspected).toEqual([]);
  });

  it('si la versión de origen ya no es la vigente (o el archivo se borró), falla sin leer otra', async () => {
    const { runner, task, files, optimizer, stored, logger } = setup();
    files.current = null;

    await runner.estimate(task);

    expect(stored()).toMatchObject({ state: 'fallida', reason: 'servicio_no_disponible' });
    expect(optimizer.inspected).toEqual([]);
    expect(loggedEvents(logger)).toContain('optimization.failed');
  });

  it('CA-21: las bitácoras llevan ids, bytes y motivo; nunca el contenido ni mensajes de `sharp`', async () => {
    const { runner, task, optimizer, logger } = setup();
    optimizer.inspectFailure = new UnreadableImageError(new Error('VipsJpeg: secreto'));

    await runner.estimate(task);

    const logged = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
    expect(logged).not.toContain('Vips');
    expect(logged).not.toContain(CONTENT.toString());
  });
});

describe('OptimizationRunner.giveUp (plan 021 §2, T-03)', () => {
  it('CA-14: con los intentos agotados la deja `fallida(servicio_no_disponible)` y anota la clase del error', async () => {
    const { runner, task, stored, logger } = setup();

    await runner.giveUp(task, new RangeError('timeout'));

    expect(stored()).toMatchObject({
      state: 'fallida',
      reason: 'servicio_no_disponible',
      updatedAt: NOW,
    });
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'optimization.failed',
      fileId: task.fileId,
      optimizationId: task.optimizationId,
      reason: 'servicio_no_disponible',
      errorClass: 'RangeError',
    });
  });

  it('una optimización ya resuelta no cambia', async () => {
    const { runner, task, optimizer, stored } = setup();
    optimizer.resultBytes = 2_000_000;
    await runner.estimate(task);

    await runner.giveUp(task, new Error('tarde'));

    expect(stored()?.state).toBe('estimada');
  });
});
