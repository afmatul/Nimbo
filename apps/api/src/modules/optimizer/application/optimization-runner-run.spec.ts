import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { FakeJobRepository, FakeOptimizer } from '../../../../test/support/optimizer-fakes';
import { FakeTransactionRunner, Journal } from '../../../../test/support/storage-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type { FileVersionRef, OptimizableFile, OptimizedVersionOutcome } from '../../storage';
import { UnreadableImageError } from '../domain/errors';
import { OptimizationJob } from '../domain/optimization-job';

import { OptimizationRunner } from './optimization-runner';
import type { OptimizerFiles } from './optimization-runner';

const OWNER = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NOW = new Date('2026-10-26T12:00:00Z');
const SOURCE = Buffer.from('original, nunca candidato de estimate');
const CONFIG = { maxPixels: 36_000_000, threshold: { minBytes: 1_000_000n, minPercent: 20 } };

function setup() {
  const jobs = new FakeJobRepository(new Journal());
  const clock = new FixedClock(NOW);
  const job = jobs.seed(
    OptimizationJob.startEstimate({
      id: randomUUID(),
      fileId: randomUUID(),
      sourceVersionId: randomUUID(),
      originalBytes: 5_000_000n,
      now: NOW,
    })
      .estimated(3_000_000n, CONFIG.threshold, NOW)
      .beginRun(randomUUID(), NOW),
  );
  const task = { optimizationId: job.id, fileId: job.fileId, ownerId: OWNER.id };
  const file: OptimizableFile = {
    id: job.fileId,
    ownerId: OWNER.id,
    kind: 'imagen',
    mime: 'image/png',
    extension: 'png',
    sizeBytes: job.originalBytes,
    currentVersionId: job.sourceVersionId,
  };
  const files = {
    findOwned: jest.fn().mockResolvedValue(file),
    findRegisteredOptimization: jest.fn().mockResolvedValue(null),
    openCurrent: jest
      .fn<Promise<Readable | null>, [unknown, FileVersionRef]>()
      .mockImplementation(() => Promise.resolve(Readable.from([SOURCE]))),
    registerOptimizedVersion: jest.fn().mockResolvedValue({
      status: 'registered',
      versionId: job.resultVersionId,
      versionNumber: 2,
      sizeBytes: 3_000_000n,
    }),
  } satisfies OptimizerFiles;
  const optimizer = new FakeOptimizer();
  optimizer.resultBytes = 3_000_000;
  const integrity = { validate: jest.fn().mockResolvedValue(true) };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue(undefined), recordInTransaction: jest.fn() };
  const runner = new OptimizationRunner(
    new FakeTransactionRunner(new Journal()),
    files,
    jobs,
    optimizer,
    clock,
    CONFIG,
    logger,
    integrity,
    audit,
  );
  const stored = () => jobs.jobs.get(job.id)?.snapshot();
  return { runner, jobs, job, task, file, files, optimizer, integrity, stored, clock };
}

describe('OptimizationRunner.run (021 T-04)', () => {
  it.each(['jpeg', 'png'] as const)(
    'CA-7: recomprime el original %s y registra una vez con su versión estable',
    async (format) => {
      const { runner, task, files, optimizer, integrity, job, stored } = setup();
      optimizer.inspection = { ...optimizer.inspection, format };

      await runner.run(task);

      expect(optimizer.optimized).toEqual([SOURCE]);
      expect(integrity.validate).toHaveBeenCalledWith(SOURCE, expect.any(Buffer));
      expect(files.registerOptimizedVersion).toHaveBeenCalledWith(
        OWNER,
        expect.objectContaining({
          fileId: job.fileId,
          sourceVersionId: job.sourceVersionId,
          versionId: job.resultVersionId,
          sizeBytes: 3_000_000n,
          content: expect.any(Readable),
        }),
      );
      expect(stored()).toMatchObject({ state: 'completada', resultBytes: 3_000_000n });
      await runner.run(task);
      expect(files.registerOptimizedVersion).toHaveBeenCalledTimes(1);
    },
  );

  it.each([4_100_000, 5_000_000, 5_100_000])(
    'CA-10: %i bytes reales no alcanzan ambos umbrales, sin registrar',
    async (bytes) => {
      const { runner, task, files, optimizer, stored } = setup();
      optimizer.resultBytes = bytes;
      await runner.run(task);
      expect(stored()).toMatchObject({
        state: 'descartada',
        reason: 'ahorro_minimo',
        resultBytes: BigInt(bytes),
      });
      expect(files.registerOptimizedVersion).not.toHaveBeenCalled();
    },
  );

  it('CA-9: falla integridad sin registrar ni subir', async () => {
    const { runner, task, files, integrity, stored } = setup();
    integrity.validate.mockResolvedValueOnce(false);
    await runner.run(task);
    expect(stored()).toMatchObject({ state: 'fallida', reason: 'integridad' });
    expect(files.registerOptimizedVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['duplicate', 'completada', null],
    ['file_changed', 'descartada', 'version_cambiada'],
    ['file_missing', 'descartada', 'archivo_eliminado'],
    ['not_smaller', 'descartada', 'ahorro_minimo'],
    ['corrupt', 'fallida', 'integridad'],
  ] as const)('plan §3: %s → %s(%s)', async (status, state, reason) => {
    const { runner, task, files, stored, job } = setup();
    const outcome: OptimizedVersionOutcome =
      status === 'duplicate'
        ? { status, versionId: job.resultVersionId ?? '', sizeBytes: 2_900_000n }
        : { status };
    files.registerOptimizedVersion.mockResolvedValueOnce(outcome);
    await runner.run(task);
    expect(stored()).toMatchObject({ state, reason });
    if (status === 'duplicate') expect(stored()?.resultBytes).toBe(2_900_000n);
  });

  it.each(['cambiado', 'eliminado'])(
    'CA-11: origen no abrible por archivo %s se descarta sin recomprimir',
    async (scenario) => {
      const { runner, task, file, files, stored, optimizer } = setup();
      files.openCurrent.mockResolvedValueOnce(null);
      files.findOwned.mockResolvedValueOnce(
        scenario === 'eliminado' ? null : { ...file, currentVersionId: randomUUID() },
      );
      await runner.run(task);
      expect(stored()).toMatchObject({
        state: 'descartada',
        reason: scenario === 'eliminado' ? 'archivo_eliminado' : 'version_cambiada',
      });
      expect(optimizer.optimized).toEqual([]);
    },
  );

  it('CA-12: tras registrar y fallar el guardado terminal, recupera duplicate aun sin origen vigente', async () => {
    const { runner, jobs, job, task, files, stored } = setup();
    const cas = jobs.compareAndSet.bind(jobs);
    jest.spyOn(jobs, 'compareAndSet').mockImplementation(async (actor, next, previous) => {
      if (next.state === 'completada') throw new Error('BD temporal');
      return cas(actor, next, previous);
    });
    await expect(runner.run(task)).rejects.toThrow('BD temporal');
    jest.restoreAllMocks();
    files.findRegisteredOptimization.mockResolvedValueOnce({
      status: 'duplicate',
      versionId: job.resultVersionId,
      sizeBytes: 3_000_000n,
    });
    files.openCurrent.mockResolvedValue(null);

    await runner.run(task);

    expect(stored()).toMatchObject({
      state: 'completada',
      resultVersionId: job.resultVersionId,
      resultBytes: 3_000_000n,
    });
    expect(files.registerOptimizedVersion).toHaveBeenCalledTimes(1);
    expect(files.openCurrent).toHaveBeenCalledTimes(1);
  });

  it('CA-14: un timeout reintenta y conserva el id de resultado; agotarlo falla', async () => {
    const { runner, task, optimizer, stored, job } = setup();
    optimizer.optimizeFailure = new Error('timeout');
    await expect(runner.run(task)).rejects.toThrow('timeout');
    expect(stored()).toMatchObject({ state: 'optimizando', resultVersionId: job.resultVersionId });
    optimizer.optimizeFailure = null;
    await runner.run(task);
    expect(stored()?.state).toBe('completada');
  });

  it('CA-14: giveUp termina una ejecución agotada en servicio_no_disponible', async () => {
    const { runner, task, stored } = setup();
    await runner.giveUp(task, new Error('timeout'));
    expect(stored()).toMatchObject({ state: 'fallida', reason: 'servicio_no_disponible' });
  });

  it('CA-9: una imagen ilegible durante run falla determinísticamente por integridad', async () => {
    const { runner, task, optimizer, stored, files } = setup();
    optimizer.optimizeFailure = new UnreadableImageError(new Error('truncada'));
    await runner.run(task);
    expect(stored()).toMatchObject({ state: 'fallida', reason: 'integridad' });
    expect(files.registerOptimizedVersion).not.toHaveBeenCalled();
  });

  it('un error transitorio del registrador se reintenta con la misma versión', async () => {
    const { runner, task, stored, files, job } = setup();
    files.registerOptimizedVersion.mockRejectedValueOnce(new Error('MinIO temporal'));
    await expect(runner.run(task)).rejects.toThrow('MinIO temporal');
    expect(stored()?.state).toBe('optimizando');
    await runner.run(task);
    expect(stored()?.state).toBe('completada');
    for (const [, input] of files.registerOptimizedVersion.mock.calls)
      expect(input.versionId).toBe(job.resultVersionId);
  });

  it('si el objeto no está pero la referencia sigue vigente, no lo clasifica como archivo eliminado', async () => {
    const { runner, task, files, stored } = setup();
    files.openCurrent.mockResolvedValueOnce(null);
    await expect(runner.run(task)).rejects.toThrow('no está disponible');
    expect(stored()?.state).toBe('optimizando');
  });

  it('giveUp recupera un registro efectivo aun si el último intento perdió su confirmación', async () => {
    const { runner, task, job, files, stored } = setup();
    files.findRegisteredOptimization.mockResolvedValueOnce({
      status: 'duplicate',
      versionId: job.resultVersionId,
      sizeBytes: 3_000_000n,
    });
    await runner.giveUp(task, new Error('BD temporal'));
    expect(stored()).toMatchObject({ state: 'completada', resultBytes: 3_000_000n });
  });

  it('un resultado de un worker con claim anterior no sobrescribe el claim nuevo', async () => {
    const { runner, task, jobs, job, optimizer, stored } = setup();
    const later = new Date(NOW.getTime() + 1000);
    optimizer.optimize = () => {
      jobs.seed(job.claim(later));
      return Promise.resolve(Buffer.alloc(3_000_000));
    };
    await runner.run(task);
    expect(stored()).toMatchObject({ state: 'optimizando', updatedAt: later });
  });
});
