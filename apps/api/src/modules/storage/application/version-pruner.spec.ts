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
import { TrashState } from '../domain/trash-state';

import { VersionPruner } from './version-pruner';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const RETAINED = 3;
const LIMITS = {
  planName: 'Plan de prueba',
  maxFileBytes: 1_000_000n,
  storageQuotaBytes: 10_000_000n,
  trashRetentionDays: 30,
  retainedVersions: RETAINED,
  readOnly: false,
  maxEditors: 0,
};

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const nodes = new FakeNodeRepository(journal);
  const versions = new FakeVersionRepository(journal);
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
      expect.objectContaining({ event: 'version.pruned', fileId: file.id, versionNumber: 1 }),
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
