import { randomUUID } from 'node:crypto';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeAuditLogger,
  FakeNodeRepository,
  FakeObjectStorage,
  FakeQuotaRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { FakeVersionRepository, seedVersionedFile } from '../../../../test/support/version-fakes';
import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import { File } from '../domain/file';
import { FileVersion } from '../domain/file-version';
import { TrashState } from '../domain/trash-state';

import { VersionPruner } from './version-pruner';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const RETAINED = 3;
/** Plazo de los originales conservados de las pruebas (las versiones sembradas se crean el 2026-10-01). */
const KEPT_UNTIL = new Date('2026-10-08T10:00:00.000Z');
const AFTER_KEPT_UNTIL = new Date('2026-10-09T03:00:00.000Z');
const LIMITS = {
  planName: 'Plan de prueba',
  maxFileBytes: 1_000_000n,
  storageQuotaBytes: 10_000_000n,
  trashRetentionDays: 30,
  retainedVersions: RETAINED,
  readOnly: false,
  maxEditors: 0,
  extraQuotaBytes: 0n,
  extraQuotaUntil: null,
};

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const nodes = new FakeNodeRepository(journal);
  const versions = new FakeVersionRepository(journal, nodes);
  const objects = new FakeObjectStorage(journal);
  const limits = new FakePlanLimitsProvider(LIMITS);
  const audit = new FakeAuditLogger(journal);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const pruner = new VersionPruner(
    transactions,
    nodes,
    versions,
    quotas,
    objects,
    limits,
    audit,
    logger,
  );
  const seed = (sizes: readonly bigint[]): File =>
    seedVersionedFile({ nodes, versions, objects }, ANA, sizes);
  return { journal, quotas, nodes, versions, objects, limits, audit, logger, pruner, seed };
}

/** La versión `number` pasa a ser un original conservado (014b) hasta `keptUntil`: no cuenta en el espacio. */
const keepOriginal = (
  versions: FakeVersionRepository,
  number: number,
  keptUntil: Date = KEPT_UNTIL,
): FileVersion => {
  const version = [...versions.versions.values()].find((v) => v.number === number);
  if (version === undefined) throw new Error(`No existe la versión ${String(number)}`);
  const kept = FileVersion.rehydrate({ ...version.snapshot(), keptUntil });
  versions.versions.set(kept.id, kept);
  return kept;
};

/** Lo que cambia el estado, en orden. */
const writesOf = (journal: Journal): string[] =>
  journal.entries.filter((entry) =>
    /^(tx:|quota:(lockUsage|addUsedBytes)|storage:purgeObject|versions:delete)/.test(entry),
  );

describe('VersionPruner (plan 014 §1, CA-13, CA-14, CA-19)', () => {
  it('CA-13: con una versión de más borra la más antigua en su transacción: lock → objeto → fila → espacio', async () => {
    const { pruner, journal, versions, quotas, objects, seed } = setup();
    const file = seed([100n, 200n, 300n, 400n]);
    const [oldest] = [...versions.versions.values()].filter((v) => v.number === 1);

    await pruner.prune(ANA, file.id);

    expect(versions.numbersOf(file.id)).toEqual([2, 3, 4]);
    expect(objects.purged).toEqual([oldest?.objectKey.value]);
    expect(quotas.added).toEqual([-100n]);
    expect(writesOf(journal)).toEqual([
      'tx:begin',
      'tx:end',
      'tx:begin',
      'quota:lockUsage',
      'storage:purgeObject',
      'versions:delete:1',
      'quota:addUsedBytes',
      'tx:end',
    ]);
  });

  it('CA-13: con varias de más (bajar de plan) borra cada una en su propia transacción, nunca la actual', async () => {
    const { pruner, journal, versions, quotas, limits, seed } = setup();
    const file = seed([100n, 200n, 300n, 400n, 500n]);
    limits.setLimits({ ...LIMITS, retainedVersions: 1 });

    await pruner.prune(ANA, file.id);

    expect(versions.numbersOf(file.id)).toEqual([5]);
    expect(quotas.added).toEqual([-100n, -200n, -300n, -400n]);
    expect(journal.entries.filter((entry) => entry === 'tx:begin')).toHaveLength(5);
  });

  it('CA-13: dentro del límite no borra nada', async () => {
    const { pruner, versions, objects, quotas, seed } = setup();
    const file = seed([100n, 200n, 300n]);

    await pruner.prune(ANA, file.id);

    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3]);
    expect(objects.purged).toEqual([]);
    expect(quotas.added).toEqual([]);
  });

  it('CA-19: audita `file.version_pruned` con el UUID del archivo y de la versión, número y bytes, sin nombres ni claves', async () => {
    const { pruner, audit, logger, seed, versions } = setup();
    const file = seed([100n, 200n, 300n, 400n]);
    const oldest = [...versions.versions.values()].find((version) => version.number === 1);

    await pruner.prune(ANA, file.id);

    expect(audit.records).toEqual([
      {
        action: AuditAction.FILE_VERSION_PRUNED,
        actor: ANA,
        targetUserId: ANA.id,
        resourceId: file.id,
        attributes: { versionId: oldest?.id, versionNumber: 1, sizeBytes: 100 },
      },
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'version.pruned',
        fileId: file.id,
        versionNumber: 1,
        reason: 'retention',
      }),
    );
    const logged = JSON.stringify([audit.records, logger.info.mock.calls]);
    expect(logged).not.toMatch(/secreto|u\//);
  });

  it('CA-14: si falla el objeto, la fila y el espacio no cambian, se registra sin claves y la siguiente poda lo reintenta', async () => {
    const { pruner, versions, quotas, objects, audit, logger, seed } = setup();
    const file = seed([100n, 200n, 300n, 400n]);
    const oldest = [...versions.versions.values()].find((version) => version.number === 1);
    objects.deleteFailures = 1;

    await expect(pruner.prune(ANA, file.id)).resolves.toBeUndefined();

    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3, 4]);
    expect(quotas.added).toEqual([]);
    expect(audit.records).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith({
      event: 'version.prune_failed',
      fileId: file.id,
      versionId: oldest?.id,
      errorName: 'Error',
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/secreto|u\//);

    await pruner.prune(ANA, file.id);

    expect(versions.numbersOf(file.id)).toEqual([2, 3, 4]);
    expect(quotas.added).toEqual([-100n]);
  });

  it('CA-14: nunca falla al llamador, aunque no pueda leer los límites del plan', async () => {
    const { pruner, limits, logger, versions, seed } = setup();
    const file = seed([100n, 200n, 300n, 400n]);
    jest.spyOn(limits, 'limitsFor').mockRejectedValue(new RangeError('billing caído'));

    await expect(pruner.prune(ANA, file.id)).resolves.toBeUndefined();

    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3, 4]);
    expect(logger.error).toHaveBeenCalledWith({
      event: 'version.prune_failed',
      fileId: file.id,
      errorName: 'RangeError',
    });
  });

  it('CA-13: si otra poda ya borró la fila, no resta el espacio dos veces ni audita', async () => {
    const { pruner, versions, quotas, audit, seed } = setup();
    const file = seed([100n, 200n, 300n, 400n]);
    const realDelete = versions.delete.bind(versions);
    jest.spyOn(versions, 'delete').mockImplementation(async (actor, version) => {
      await realDelete(actor, version);
      return false;
    });

    await pruner.prune(ANA, file.id);

    expect(quotas.added).toEqual([]);
    expect(audit.records).toEqual([]);
  });

  it('014b CA-8, RN-7: un original conservado que alcanza la poda se borra sin restar de `espacio_usado`', async () => {
    const { pruner, versions, objects, quotas, audit, seed } = setup();
    const file = seed([100n, 200n, 300n, 400n]);
    const original = keepOriginal(versions, 1);

    await pruner.prune(ANA, file.id);

    expect(versions.numbersOf(file.id)).toEqual([2, 3, 4]);
    expect(objects.purged).toEqual([original.objectKey.value]);
    expect(quotas.added).toEqual([]);
    expect(audit.records).toHaveLength(1);
  });

  it('CA-16: un archivo ajeno, inexistente o en la papelera no se poda', async () => {
    const { pruner, nodes, versions, objects, seed } = setup();
    const file = seed([100n, 200n, 300n, 400n]);
    const bruno = createActor('22222222-2222-4222-8222-222222222222', Role.CLIENT);

    await pruner.prune(bruno, file.id);
    await pruner.prune(ANA, randomUUID());
    nodes.files.set(
      file.id,
      File.rehydrate({
        ...file.snapshot(),
        trash: TrashState.start(new Date(), LIMITS.trashRetentionDays),
      }),
    );
    await pruner.prune(ANA, file.id);

    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3, 4]);
    expect(objects.purged).toEqual([]);
  });
});

describe('VersionPruner.purgeExpiredOriginals (014b CA-6, CA-7, CA-9, CA-13)', () => {
  it('CA-6: borra cada original vencido en su transacción (objeto y fila) sin restar de `espacio_usado` y dice cuántos', async () => {
    const { pruner, journal, versions, objects, quotas, seed } = setup();
    const file = seed([100n, 200n, 300n]);
    const first = keepOriginal(versions, 1);
    const second = keepOriginal(versions, 2);

    await expect(pruner.purgeExpiredOriginals(ANA, AFTER_KEPT_UNTIL)).resolves.toBe(2);

    expect(versions.numbersOf(file.id)).toEqual([3]);
    expect(objects.purged).toEqual([first.objectKey.value, second.objectKey.value]);
    expect(quotas.added).toEqual([]);
    expect(writesOf(journal)).toEqual([
      'tx:begin',
      'tx:end',
      'tx:begin',
      'quota:lockUsage',
      'storage:purgeObject',
      'versions:delete:1',
      'tx:end',
      'tx:begin',
      'quota:lockUsage',
      'storage:purgeObject',
      'versions:delete:2',
      'tx:end',
    ]);
  });

  it('CA-6: antes de su fecha, un original no se purga; las versiones que cuentan y la actual, nunca', async () => {
    const { pruner, versions, objects, seed } = setup();
    const file = seed([100n, 200n, 300n]);
    keepOriginal(versions, 1);
    keepOriginal(versions, 3);

    await expect(pruner.purgeExpiredOriginals(ANA, KEPT_UNTIL)).resolves.toBe(1);
    await expect(
      pruner.purgeExpiredOriginals(ANA, new Date(KEPT_UNTIL.getTime() - 1)),
    ).resolves.toBe(0);

    expect(versions.numbersOf(file.id)).toEqual([2, 3]);
    expect(objects.purged).toHaveLength(1);
  });

  it('CA-9: el original de un archivo en la papelera o ajeno no se purga por plazo', async () => {
    const { pruner, nodes, versions, objects, seed } = setup();
    const file = seed([100n, 200n]);
    keepOriginal(versions, 1);
    const bruno = createActor('22222222-2222-4222-8222-222222222222', Role.CLIENT);
    await expect(pruner.purgeExpiredOriginals(bruno, AFTER_KEPT_UNTIL)).resolves.toBe(0);
    nodes.files.set(
      file.id,
      File.rehydrate({ ...file.snapshot(), trash: TrashState.start(KEPT_UNTIL, 30) }),
    );

    await expect(pruner.purgeExpiredOriginals(ANA, AFTER_KEPT_UNTIL)).resolves.toBe(0);

    expect(versions.numbersOf(file.id)).toEqual([1, 2]);
    expect(objects.purged).toEqual([]);
  });

  it('CA-13: audita `file.version_pruned` con UUID, número y bytes y registra `reason: kept_expired`, sin nombres ni claves', async () => {
    const { pruner, versions, audit, logger, seed } = setup();
    const file = seed([100n, 200n]);
    const original = keepOriginal(versions, 1);

    await pruner.purgeExpiredOriginals(ANA, AFTER_KEPT_UNTIL);

    expect(audit.records).toEqual([
      {
        action: AuditAction.FILE_VERSION_PRUNED,
        actor: ANA,
        targetUserId: ANA.id,
        resourceId: file.id,
        attributes: { versionId: original.id, versionNumber: 1, sizeBytes: 100 },
      },
    ]);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'version.pruned',
      fileId: file.id,
      versionId: original.id,
      versionNumber: 1,
      reason: 'kept_expired',
    });
    expect(JSON.stringify([audit.records, logger.info.mock.calls])).not.toMatch(/secreto|u\//);
  });

  it('CA-7: si falla el objeto, la fila y el espacio no cambian, no lo cuenta y la pasada siguiente lo reintenta', async () => {
    const { pruner, versions, objects, quotas, audit, logger, seed } = setup();
    const file = seed([100n, 200n]);
    const original = keepOriginal(versions, 1);
    objects.deleteFailures = 1;

    await expect(pruner.purgeExpiredOriginals(ANA, AFTER_KEPT_UNTIL)).resolves.toBe(0);

    expect(versions.numbersOf(file.id)).toEqual([1, 2]);
    expect(quotas.added).toEqual([]);
    expect(audit.records).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith({
      event: 'version.prune_failed',
      fileId: file.id,
      versionId: original.id,
      errorName: 'Error',
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/secreto|u\//);

    await expect(pruner.purgeExpiredOriginals(ANA, AFTER_KEPT_UNTIL)).resolves.toBe(1);
    expect(versions.numbersOf(file.id)).toEqual([2]);
  });

  it('CA-7: nunca falla al llamador, aunque no pueda listar los originales vencidos', async () => {
    const { pruner, versions, logger } = setup();
    jest.spyOn(versions, 'listExpiredKept').mockRejectedValue(new RangeError('Postgres caído'));

    await expect(pruner.purgeExpiredOriginals(ANA, AFTER_KEPT_UNTIL)).resolves.toBe(0);

    expect(logger.error).toHaveBeenCalledWith({
      event: 'version.prune_failed',
      userId: ANA.id,
      errorName: 'RangeError',
    });
  });
});
