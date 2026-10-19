import { randomUUID } from 'node:crypto';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeAuditLogger,
  FakeNodeRepository,
  FakeObjectStorage,
  FakeQuotaRepository,
  FakeRateLimiter,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { FakeVersionRepository, seedVersionedFile } from '../../../../test/support/version-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import {
  NodeNotFoundError,
  QuotaExceededError,
  StorageTooManyRequestsError,
  VersionAlreadyCurrentError,
  VersionNotFoundError,
} from '../domain/errors';
import type { File } from '../domain/file';

import { FileVersionService } from './file-version.service';
import type { PlanLimits } from './plan-limits';
import { QuotaService } from './quota.service';
import { VersionPruner } from './version-pruner';
import { VersionRestoreService } from './version-restore.service';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const BRUNO: Actor = createActor('44444444-4444-4444-8444-444444444444', Role.CLIENT);
const NOW = new Date('2026-10-08T10:00:00.000Z');
const RESTORE_PER_MINUTE = 5;
const RETRY_AFTER_SECONDS = 42;
/** Retención amplia: la restauración no poda y el orden de pasos queda limpio. */
const LIMITS: PlanLimits = {
  planName: 'Plan de prueba',
  maxFileBytes: 1_000_000n,
  storageQuotaBytes: 10_000_000n,
  trashRetentionDays: 30,
  retainedVersions: 10,
  maxEditors: 3,
};

function setup(limits: PlanLimits = LIMITS) {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const nodes = new FakeNodeRepository(journal);
  const versions = new FakeVersionRepository(journal);
  const objects = new FakeObjectStorage(journal);
  const audit = new FakeAuditLogger(journal);
  const rateLimiter = new FakeRateLimiter(journal);
  const planLimits = new FakePlanLimitsProvider(limits);
  const clock = new FixedClock(NOW);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const pruner = new VersionPruner(
    transactions,
    nodes,
    versions,
    quotas,
    objects,
    planLimits,
    audit,
    logger,
  );
  const fileVersions = new FileVersionService(quotas, versions, nodes, pruner, logger);
  const service = new VersionRestoreService(
    transactions,
    nodes,
    versions,
    quotas,
    objects,
    new QuotaService(quotas, clock),
    fileVersions,
    planLimits,
    rateLimiter,
    audit,
    clock,
    { restorePerMinute: RESTORE_PER_MINUTE },
    logger,
  );
  const file = seedVersionedFile({ nodes, versions, objects }, ANA, [100n, 250n, 200n]);
  return { journal, quotas, nodes, versions, objects, audit, rateLimiter, logger, service, file };
}

type Setup = ReturnType<typeof setup>;

const versionNumbered = (versions: FakeVersionRepository, file: File, number: number) => {
  const version = [...versions.versions.values()].find(
    (candidate) => candidate.fileId === file.id && candidate.number === number,
  );
  if (version === undefined) throw new Error(`Falta la versión ${String(number)}`);
  return version;
};

/** Ni copia ni escritura: el caso terminó antes de tocar el almacenamiento (CA-10, CA-11, CA-12). */
const expectNothingChanged = ({ journal, quotas, versions, file }: Setup): void => {
  expect(journal.entries).not.toContain('storage:copyObject');
  expect(quotas.added).toEqual([]);
  expect(versions.numbersOf(file.id)).toEqual([1, 2, 3]);
};

describe('VersionRestoreService (plan 014 §1, CA-9 a CA-12, CA-19)', () => {
  it('plan §1: tasa → archivo → versión → cuota → copia → transacción que revalida y registra → poda → auditoría', async () => {
    const context = setup();
    const { service, file, versions, journal } = context;

    await service.restore(ANA, file.id, versionNumbered(versions, file, 1).id);

    expect(journal.entries).toEqual([
      'rate:consume',
      'tx:begin',
      'nodes:findAccessibleById',
      'versions:find',
      'quota:lockAndReadUsage',
      'tx:end',
      'storage:copyObject',
      'tx:begin',
      'quota:lockUsage',
      'nodes:findAccessibleById',
      'versions:find',
      'quota:lockAndReadUsage',
      'quota:lockUsage',
      'versions:nextNumber',
      'versions:insert:4',
      'nodes:updateCurrentVersion',
      'quota:addUsedBytes',
      'tx:end',
      'tx:begin',
      'nodes:findAccessibleById',
      'versions:list',
      'tx:end',
      `audit:${AuditAction.FILE_VERSION_RESTORED}`,
    ]);
  });

  it('CA-9: crea una versión nueva `restauracion` con el contenido copiado, la deja actual y suma su tamaño', async () => {
    const { service, file, versions, objects, nodes, quotas } = setup();
    const source = versionNumbered(versions, file, 1);
    const before = [...versions.versions.values()].map((version) => version.snapshot());

    const restored = await service.restore(ANA, file.id, source.id);

    const { version } = restored;
    expect(version).toMatchObject({
      number: 4,
      origin: 'restauracion',
      restoredFromNumber: 1,
      sizeBytes: 100n,
      createdBy: ANA.id,
      fileId: file.id,
    });
    expect(restored.deltaBytes).toBe(-100n);
    expect(version.objectKey.value).toBe(`u/${ANA.id}/${file.id}/${version.id}`);
    expect(objects.objects.get(version.objectKey.value)).toEqual(
      objects.objects.get(source.objectKey.value),
    );
    expect(nodes.files.get(file.id)?.currentVersionId).toBe(version.id);
    expect(quotas.added).toEqual([100n]);
    const untouched = [...versions.versions.values()]
      .filter((candidate) => candidate.id !== version.id)
      .map((candidate) => candidate.snapshot());
    expect(untouched).toEqual(before);
  });

  it('CA-19: audita `file.version_restored` con UUID, números y bytes, sin nombre ni clave de objeto', async () => {
    const { service, file, versions, audit, logger } = setup();

    const { version } = await service.restore(ANA, file.id, versionNumbered(versions, file, 2).id);

    expect(audit.records).toEqual([
      expect.objectContaining({
        action: AuditAction.FILE_VERSION_RESTORED,
        actor: ANA,
        targetUserId: ANA.id,
        resourceId: file.id,
        attributes: {
          versionId: version.id,
          versionNumber: 4,
          restoredFromNumber: 2,
          sizeBytes: 250,
        },
      }),
    ]);
    const logged = JSON.stringify([audit.records, logger.info.mock.calls]);
    expect(logged).not.toContain(file.name.value);
    expect(logged).not.toContain('u/');
  });

  it('CA-19: una auditoría caída no deshace la restauración', async () => {
    const { service, file, versions, audit, nodes } = setup();
    audit.fails = true;

    const { version } = await service.restore(ANA, file.id, versionNumbered(versions, file, 1).id);

    expect(nodes.files.get(file.id)?.currentVersionId).toBe(version.id);
  });

  it('CA-13: tras el commit poda lo que excede la retención del plan', async () => {
    const context = setup({ ...LIMITS, retainedVersions: 3 });
    const { service, file, versions } = context;

    await service.restore(ANA, file.id, versionNumbered(versions, file, 1).id);

    expect(versions.numbersOf(file.id)).toEqual([2, 3, 4]);
  });

  it('CA-10: restaurar la versión actual es `409` y no cambia nada', async () => {
    const context = setup();
    const { service, file } = context;

    await expect(service.restore(ANA, file.id, file.currentVersionId)).rejects.toThrow(
      VersionAlreadyCurrentError,
    );
    expectNothingChanged(context);
  });

  it('CA-11: una versión inexistente o de otro archivo es `404` de versión y no cambia nada', async () => {
    const context = setup();
    const { service, file, nodes, versions, objects } = context;
    const other = seedVersionedFile({ nodes, versions, objects }, ANA, [300n]);

    await expect(service.restore(ANA, file.id, randomUUID())).rejects.toThrow(VersionNotFoundError);
    await expect(service.restore(ANA, file.id, other.currentVersionId)).rejects.toThrow(
      VersionNotFoundError,
    );
    expectNothingChanged(context);
  });

  it('CA-16: un archivo ajeno o inexistente es `404` de nodo y no busca la versión', async () => {
    const context = setup();
    const { service, file, versions, journal } = context;
    const versionId = versionNumbered(versions, file, 1).id;

    await expect(service.restore(BRUNO, file.id, versionId)).rejects.toThrow(NodeNotFoundError);
    await expect(service.restore(ANA, randomUUID(), versionId)).rejects.toThrow(NodeNotFoundError);
    expect(journal.entries).not.toContain('versions:find');
    expectNothingChanged(context);
  });

  it('CA-12: si no cabe en la cuota es `422` con lo que falta para restaurar y no copia nada', async () => {
    const context = setup({ ...LIMITS, storageQuotaBytes: 600n });
    const { service, file, versions, quotas } = context;
    quotas.usage = { usedBytes: 550n, reservedBytes: 0n };

    const attempt = service.restore(ANA, file.id, versionNumbered(versions, file, 2).id);

    await expect(attempt).rejects.toBeInstanceOf(QuotaExceededError);
    await expect(attempt).rejects.toMatchObject({
      details: { missingBytes: 200 },
      message: expect.stringContaining('para restaurar esta versión') as unknown,
    });
    expectNothingChanged(context);
  });

  it('Art. XI: si la transacción falla tras copiar, purga la copia y relanza el error', async () => {
    const context = setup();
    const { service, file, versions, objects, nodes } = context;
    const failure = new Error('base caída');
    jest.spyOn(versions, 'insert').mockRejectedValueOnce(failure);

    await expect(service.restore(ANA, file.id, versionNumbered(versions, file, 1).id)).rejects.toBe(
      failure,
    );

    const [copy] = objects.purged;
    expect(objects.purged).toHaveLength(1);
    expect(copy).toMatch(new RegExp(`^u/${ANA.id}/${file.id}/`));
    expect(objects.objects.has(copy ?? '')).toBe(false);
    expect(nodes.files.get(file.id)?.currentVersionId).toBe(file.currentVersionId);
    expect(context.quotas.added).toEqual([]);
  });

  it('plan §7: si la versión se poda mientras se copia, la revalidación es `404` y purga la copia', async () => {
    const { service, file, versions, objects } = setup();
    const source = versionNumbered(versions, file, 1);
    const copy = objects.copyObject.bind(objects);
    jest.spyOn(objects, 'copyObject').mockImplementationOnce(async (from, to) => {
      const copied = await copy(from, to);
      versions.versions.delete(source.id);
      return copied;
    });

    await expect(service.restore(ANA, file.id, source.id)).rejects.toThrow(VersionNotFoundError);

    expect(objects.purged).toHaveLength(1);
    expect(versions.numbersOf(file.id)).toEqual([2, 3]);
  });

  it('plan §7: si la versión se poda antes de copiar, revalida y responde `404` de versión sin registrar nada', async () => {
    const context = setup();
    const { service, file, versions, objects, quotas } = context;
    const source = versionNumbered(versions, file, 1);
    const copy = objects.copyObject.bind(objects);
    jest.spyOn(objects, 'copyObject').mockImplementationOnce((from, to) => {
      versions.versions.delete(source.id);
      objects.objects.delete(source.objectKey.value);
      return copy(from, to);
    });

    await expect(service.restore(ANA, file.id, source.id)).rejects.toThrow(VersionNotFoundError);

    expect(quotas.added).toEqual([]);
    expect(objects.purged).toEqual([]);
    expect(versions.numbersOf(file.id)).toEqual([2, 3]);
  });

  it('plan §7: sin el objeto de origen es `404` de versión aunque la fila siga (poda sin confirmar)', async () => {
    const { service, file, versions, objects, quotas } = setup();
    const source = versionNumbered(versions, file, 1);
    objects.objects.delete(source.objectKey.value);

    await expect(service.restore(ANA, file.id, source.id)).rejects.toThrow(VersionNotFoundError);

    expect(quotas.added).toEqual([]);
    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3]);
  });

  it('Art. XI: una purga fallida de la copia se registra sin clave y no tapa el error original', async () => {
    const { service, file, versions, objects, logger } = setup();
    const failure = new Error('base caída');
    jest.spyOn(versions, 'insert').mockRejectedValueOnce(failure);
    objects.deleteFailures = 1;

    await expect(service.restore(ANA, file.id, versionNumbered(versions, file, 1).id)).rejects.toBe(
      failure,
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'version.restore_discard_failed', fileId: file.id }),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('u/');
  });

  it('si la copia falla no registra nada', async () => {
    const context = setup();
    const { service, file, versions, objects, quotas } = context;
    objects.failCopy = true;

    await expect(
      service.restore(ANA, file.id, versionNumbered(versions, file, 1).id),
    ).rejects.toThrow();

    expect(quotas.added).toEqual([]);
    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3]);
  });

  it('plan §5: sobre el límite propio de restauraciones es `429` antes de resolver el archivo', async () => {
    const { service, file, versions, rateLimiter, journal, logger } = setup();
    rateLimiter.decision = { allowed: false, retryAfterSeconds: RETRY_AFTER_SECONDS };

    const attempt = service.restore(ANA, file.id, versionNumbered(versions, file, 1).id);

    await expect(attempt).rejects.toBeInstanceOf(StorageTooManyRequestsError);
    await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: RETRY_AFTER_SECONDS });
    expect(journal.entries).toEqual(['rate:consume']);
    expect(rateLimiter.calls).toEqual([
      {
        key: `storage:version-restore:${ANA.id}`,
        rules: [{ limit: RESTORE_PER_MINUTE, windowSeconds: 60 }],
      },
    ]);
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'upload.rate_limited',
      operation: 'version_restore',
    });
  });
});
