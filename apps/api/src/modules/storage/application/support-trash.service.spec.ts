import { FakeTransactionRunner, Journal } from '../../../../test/support/storage-fakes';
import { FakeSupportTrashRepository } from '../../../../test/support/trash-fakes';
import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { FolderDepthExceededError, NodeNotFoundError } from '../domain/errors';
import { Folder } from '../domain/folder';
import { FolderName } from '../domain/folder-name.vo';
import { FolderPath } from '../domain/folder-path';

import type { FolderConfig } from './folder-config';
import type { SupportRestoreResult } from './ports/i-support-trash.repository.port';
import { SupportTrashService } from './support-trash.service';

const MAX_DEPTH = 4;
const CONFIG: FolderConfig = { maxDepth: MAX_DEPTH };
const SUPPORT: Actor = createActor('33333333-3333-4333-8333-333333333333', Role.SUPPORT);
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const FOLDER_ID = '44444444-4444-4444-8444-444444444444';
const AT = new Date('2026-10-27T10:00:00.000Z');
const ITEM = { type: 'folder', id: FOLDER_ID } as const;

const restoredFolder = (): SupportRestoreResult => ({
  node: Folder.rehydrate({
    id: FOLDER_ID,
    ownerId: OWNER_ID,
    parentId: null,
    name: FolderName.of('Contratos (1)'),
    path: FolderPath.childOf(null, FOLDER_ID),
    createdAt: AT,
    updatedAt: AT,
    trash: null,
  }),
  outcome: 'moved_to_root',
  originalName: 'Contratos',
  itemCount: 3,
  sizeBytes: 2048n,
});

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const repository = new FakeSupportTrashRepository(journal);
  const service = new SupportTrashService(transactions, repository, CONFIG);
  return { journal, transactions, repository, service };
}

describe('SupportTrashService (spec 011b CA-10 a CA-12)', () => {
  it('CA-10: lista la papelera del cliente pedido dentro de una transacción como Soporte', async () => {
    const { journal, transactions, repository, service } = setup();
    const query = { ownerId: OWNER_ID, cursor: 'c', limit: 20 };

    await expect(service.list(SUPPORT, query)).resolves.toBe(repository.page);

    expect(repository.queries).toEqual([query]);
    expect(transactions.actors).toEqual([SUPPORT.id]);
    expect(journal.entries).toEqual(['tx:begin', 'supportTrash:listRoots', 'tx:end']);
  });

  it('CA-11: restaura con la profundidad máxima de `FOLDER_MAX_DEPTH` y devuelve lo que audita `node.restored`', async () => {
    const { journal, repository, service } = setup();
    repository.result = restoredFolder();

    await expect(service.restore(SUPPORT, { ownerId: OWNER_ID, item: ITEM })).resolves.toBe(
      repository.result,
    );

    expect(repository.requests).toEqual([{ ownerId: OWNER_ID, item: ITEM, maxDepth: MAX_DEPTH }]);
    expect(journal.entries).toEqual(['tx:begin', 'supportTrash:restoreRoot', 'tx:end']);
  });

  it.each([
    ['una raíz ajena, vencida o que no es raíz', new NodeNotFoundError()],
    ['una carpeta que no cabe en su destino', new FolderDepthExceededError(MAX_DEPTH, 'restore')],
  ])('CA-12: %s deja pasar el error del repositorio', async (_case, failure) => {
    const { repository, service } = setup();
    repository.failure = failure;

    await expect(service.restore(SUPPORT, { ownerId: OWNER_ID, item: ITEM })).rejects.toBe(failure);
  });
});
