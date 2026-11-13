import { randomUUID } from 'node:crypto';

import { BATCH_MAX_ITEMS } from '@nimbo/contracts';

import {
  FakeNodeRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { createActor, Role } from '../../../shared';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';
import { Folder } from '../domain/folder';
import { FolderName } from '../domain/folder-name.vo';

import { BatchDownloadService } from './batch-download.service';
import type { FileService } from './file.service';

const ANA = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const AT = new Date('2026-09-30T10:00:00.000Z');

const setup = () => {
  const journal = new Journal();
  const nodes = new FakeNodeRepository(journal);
  const getDownloadUrl = jest.fn((_actor: unknown, fileId: string) =>
    Promise.resolve({ url: `https://objetos.test/${fileId}`, expiresAt: AT }),
  );
  const service = new BatchDownloadService(new FakeTransactionRunner(journal), nodes, {
    getDownloadUrl,
  } as unknown as FileService);
  const folder = (name: string, parent: Folder | null = null): Folder => {
    const created = Folder.create({
      id: randomUUID(),
      ownerId: ANA.id,
      name: FolderName.of(name),
      parent,
      maxDepth: 5,
      now: AT,
    });
    nodes.folders.set(created.id, created);
    return created;
  };
  const file = (name: string, folderId: string | null = null): File => {
    const created = File.create({
      id: randomUUID(),
      ownerId: ANA.id,
      folderId,
      name: FileName.of(name),
      kind: 'pdf',
      sizeBytes: 10n,
      currentVersionId: randomUUID(),
      now: AT,
    });
    nodes.files.set(created.id, created);
    return created;
  };
  return { service, getDownloadUrl, folder, file };
};

describe('BatchDownloadService (descarga por lote)', () => {
  it('firma una URL por archivo, con su nombre, y expande las carpetas con sus subcarpetas', async () => {
    const { service, folder, file, getDownloadUrl } = setup();
    const loose = file('suelto.pdf');
    const projects = folder('Proyectos');
    const inProjects = file('plan.pdf', projects.id);
    const inChild = file('contrato.pdf', folder('Acme', projects).id);

    const result = await service.download(ANA, [
      { type: 'file', id: loose.id },
      { type: 'folder', id: projects.id },
    ]);

    expect(result.failed).toEqual([]);
    expect(result.downloads.map((entry) => entry.name).sort()).toEqual(
      ['contrato.pdf', 'plan.pdf', 'suelto.pdf'].sort(),
    );
    expect(result.downloads.find((entry) => entry.id === inChild.id)?.url).toBe(
      `https://objetos.test/${inChild.id}`,
    );
    expect(getDownloadUrl).toHaveBeenCalledWith(ANA, inProjects.id);
  });

  it('un nodo que el actor no ve falla con el 404 uniforme y no frena a los demás', async () => {
    const { service, file } = setup();
    const visible = file('visible.pdf');
    const missing = { type: 'file', id: randomUUID() } as const;

    const result = await service.download(ANA, [missing, { type: 'file', id: visible.id }]);

    expect(result.failed).toEqual([{ item: missing, code: 'STORAGE_NODE_NOT_FOUND' }]);
    expect(result.downloads.map((entry) => entry.id)).toEqual([visible.id]);
  });

  it('una carpeta que no cabe en lo que queda del lote falla con STORAGE_BATCH_TOO_LARGE', async () => {
    const { service, folder, file } = setup();
    const big = folder('Grande');
    for (let n = 0; n < BATCH_MAX_ITEMS; n += 1) file(`parte-${String(n)}.pdf`, big.id);
    const small = file('chico.pdf');

    const result = await service.download(ANA, [
      { type: 'file', id: small.id },
      { type: 'folder', id: big.id },
    ]);

    expect(result.failed).toEqual([
      { item: { type: 'folder', id: big.id }, code: 'STORAGE_BATCH_TOO_LARGE' },
    ]);
    expect(result.downloads.map((entry) => entry.id)).toEqual([small.id]);
  });
});
