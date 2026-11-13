import { createActor, Role } from '../../../shared';
import { AccountReadOnlyError, NodeNotFoundError } from '../domain/errors';

import type { FileService } from './file.service';
import type { FolderService } from './folder.service';
import { NodeBatchService } from './node-batch.service';
import type { TrashService } from './trash.service';

const ANA = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const FILE = { type: 'file', id: 'f-1' } as const;
const FOLDER = { type: 'folder', id: 'd-1' } as const;
const MISSING = { type: 'file', id: 'f-x' } as const;
const TARGET = 'd-9';

const rejectMissing = (_actor: unknown, id: string) =>
  id === MISSING.id ? Promise.reject(new NodeNotFoundError()) : Promise.resolve({});

const setup = (readOnly = false) => {
  const files = { move: jest.fn(rejectMissing) };
  const folders = { move: jest.fn(rejectMissing) };
  const trash = { trashFile: jest.fn(rejectMissing), trashFolder: jest.fn(rejectMissing) };
  const service = new NodeBatchService(
    files as unknown as FileService,
    folders as unknown as FolderService,
    trash as unknown as TrashService,
    {
      assertWritable: () =>
        readOnly ? Promise.reject(new AccountReadOnlyError()) : Promise.resolve(),
    },
  );
  return { service, files, folders, trash };
};

describe('NodeBatchService (lotes del explorador)', () => {
  it('mover usa la operación individual de cada tipo; un nombre repetido no se renombra solo', async () => {
    const { service, files, folders } = setup();

    const result = await service.move(ANA, {
      items: [FILE, FOLDER, MISSING],
      targetFolderId: TARGET,
    });

    expect(files.move).toHaveBeenCalledWith(ANA, FILE.id, { folderId: TARGET, onConflict: 'ask' });
    expect(folders.move).toHaveBeenCalledWith(ANA, FOLDER.id, TARGET);
    expect(result).toEqual({
      succeeded: [FILE, FOLDER],
      failed: [{ item: MISSING, code: 'STORAGE_NODE_NOT_FOUND' }],
    });
  });

  it('mover en solo lectura rechaza todo el lote con el 403 de la solo lectura, sin mover nada', async () => {
    const { service, files } = setup(true);

    await expect(
      service.move(ANA, { items: [FILE], targetFolderId: TARGET }),
    ).rejects.toBeInstanceOf(AccountReadOnlyError);
    expect(files.move).not.toHaveBeenCalled();
  });

  it('enviar a la papelera usa la de archivo o la de carpeta, como DELETE individual', async () => {
    const { service, trash } = setup();

    const result = await service.trash(ANA, [FOLDER, FILE]);

    expect(trash.trashFolder).toHaveBeenCalledWith(ANA, FOLDER.id);
    expect(trash.trashFile).toHaveBeenCalledWith(ANA, FILE.id);
    expect(result.succeeded).toEqual([FOLDER, FILE]);
  });
});
