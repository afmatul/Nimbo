import { FakeTransactionRunner, Journal } from '../../../../test/support/storage-fakes';
import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';
import { Folder } from '../domain/folder';
import { FolderName } from '../domain/folder-name.vo';

import { ExplorerBadgeService } from './explorer-badge.service';
import { toExplorerNode } from './node-summary';
import type { IIndexStatusReader, ISharedNodeReader } from './ports/i-node-badge-readers.port';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const AT = new Date('2026-09-30T10:00:00.000Z');
const FOLDER = Folder.create({
  id: '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  ownerId: ANA.id,
  name: FolderName.of('Fotos'),
  parent: null,
  maxDepth: 3,
  now: AT,
});
const FILE = File.create({
  id: '3f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  ownerId: ANA.id,
  folderId: null,
  name: FileName.of('informe.pdf'),
  kind: 'pdf',
  sizeBytes: 10n,
  currentVersionId: '4f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  now: AT,
});

const setup = () => {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const shared: ISharedNodeReader = {
    sharedIds: jest.fn(() => Promise.resolve(new Set([FOLDER.id]))),
  };
  const indexing: IIndexStatusReader = {
    statusesOf: jest.fn(() => Promise.resolve(new Map([[FILE.id, 'indexed' as const]]))),
  };
  return {
    service: new ExplorerBadgeService(transactions, shared, indexing),
    transactions,
    shared,
    indexing,
  };
};

describe('ExplorerBadgeService (explorador: compartido e indexación)', () => {
  it('pide a los lectores solo los nodos ya listados, dentro de la transacción del actor', async () => {
    const { service, transactions, shared, indexing } = setup();

    await service.badgesOf(ANA, [FOLDER, FILE]);

    expect(transactions.actors).toEqual([ANA.id]);
    expect(shared.sharedIds).toHaveBeenCalledWith(ANA, [
      { type: 'folder', id: FOLDER.id },
      { type: 'file', id: FILE.id },
    ]);
    expect(indexing.statusesOf).toHaveBeenCalledWith(ANA, [
      { id: FILE.id, kind: 'pdf', currentVersionId: FILE.currentVersionId },
    ]);
  });

  it('sin nodos no consulta nada', async () => {
    const { service, shared, indexing } = setup();

    await service.badgesOf(ANA, []);

    expect(shared.sharedIds).not.toHaveBeenCalled();
    expect(indexing.statusesOf).not.toHaveBeenCalled();
  });

  it('cada elemento lleva `shared` y los archivos su `indexStatus`; sin estado, `pending`', async () => {
    const { service } = setup();
    const badges = await service.badgesOf(ANA, [FOLDER, FILE]);
    const unknown = { ...badges, indexStatus: new Map() };

    expect(toExplorerNode(FOLDER, badges)).toMatchObject({ type: 'folder', shared: true });
    expect(toExplorerNode(FOLDER, badges)).not.toHaveProperty('indexStatus');
    expect(toExplorerNode(FILE, badges)).toMatchObject({ shared: false, indexStatus: 'indexed' });
    expect(toExplorerNode(FILE, unknown)).toMatchObject({ indexStatus: 'pending' });
  });
});
