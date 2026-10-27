import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeNodeRepository,
  FakeObjectStorage,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { FakeVersionRepository, seedVersionedFile } from '../../../../test/support/version-fakes';
import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { NodeNotFoundError } from '../domain/errors';
import { File } from '../domain/file';
import { TrashState } from '../domain/trash-state';

import { VersionHistoryService } from './version-history.service';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const BRUNO: Actor = createActor('44444444-4444-4444-8444-444444444444', Role.CLIENT);
const RETAINED = 3;
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
  const nodes = new FakeNodeRepository(journal);
  const versions = new FakeVersionRepository(journal);
  const objects = new FakeObjectStorage(journal);
  const limits = new FakePlanLimitsProvider(LIMITS);
  const service = new VersionHistoryService(transactions, nodes, versions, limits);
  const seed = (sizes: readonly bigint[]): File =>
    seedVersionedFile({ nodes, versions, objects }, ANA, sizes);
  return { journal, nodes, versions, limits, service, seed };
}

describe('VersionHistoryService (plan 014 §2, CA-6, CA-16)', () => {
  it('CA-6: devuelve el historial de la más reciente a la más antigua, con su cambio de tamaño y la actual', async () => {
    const { service, seed } = setup();
    const file = seed([100n, 250n, 200n]);

    const history = await service.list(ANA, file.id);

    expect(history.entries.map((entry) => entry.version.number)).toEqual([3, 2, 1]);
    expect(history.entries.map((entry) => entry.deltaBytes)).toEqual([-50n, 150n, null]);
    expect(history.file.currentVersionId).toBe(file.currentVersionId);
  });

  it('CA-20: devuelve el archivo resuelto, para que la ficha muestre su nombre, tipo y carpeta', async () => {
    const { service, seed } = setup();
    const file = seed([100n]);

    const history = await service.list(ANA, file.id);

    expect(history.file.snapshot()).toEqual(file.snapshot());
  });

  it('CA-6: informa las versiones que conserva el plan del actor', async () => {
    const { service, seed, limits } = setup();
    const file = seed([100n]);

    const history = await service.list(ANA, file.id);

    expect(history.retainedVersions).toBe(RETAINED);
    expect(limits.requestedFor).toEqual([ANA.id]);
  });

  it('plan §5: resuelve el archivo con `accessibleNodes` antes de leer sus versiones, en una transacción con actor', async () => {
    const { service, seed, journal } = setup();
    const file = seed([100n, 200n]);

    await service.list(ANA, file.id);

    expect(journal.entries).toEqual([
      'tx:begin',
      'nodes:findAccessibleById',
      'versions:list',
      'tx:end',
    ]);
  });

  it('CA-16: un archivo en la papelera es `STORAGE_NODE_NOT_FOUND` y no lee versiones', async () => {
    const { service, seed, nodes, journal } = setup();
    const file = seed([100n, 200n]);
    nodes.files.set(
      file.id,
      File.rehydrate({
        ...file.snapshot(),
        trash: TrashState.start(new Date(), LIMITS.trashRetentionDays),
      }),
    );

    await expect(service.list(ANA, file.id)).rejects.toThrow(NodeNotFoundError);
    expect(journal.entries).not.toContain('versions:list');
  });

  it('CA-16: un archivo ajeno responde igual que uno inexistente y no lee versiones', async () => {
    const { service, seed, journal } = setup();
    const file = seed([100n]);

    await expect(service.list(BRUNO, file.id)).rejects.toThrow(NodeNotFoundError);
    await expect(service.list(ANA, '55555555-5555-4555-8555-555555555555')).rejects.toThrow(
      NodeNotFoundError,
    );
    expect(journal.entries).not.toContain('versions:list');
  });
});
