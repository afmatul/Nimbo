import { randomUUID } from 'node:crypto';

import {
  fileDetailResponseSchema,
  folderContentsResponseSchema,
  spaceSummaryResponseSchema,
} from '@nimbo/contracts';
import type { FileDetailResponse, FolderContentsResponse } from '@nimbo/contracts';
import type { Response } from 'supertest';

import { Role } from '../../../src/shared';
import { insertShare } from '../sharing/sharing-test-db';

import { createStorageHttpApp, insertCommittedFile } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';
import { insertFolder } from './storage-test-db';

/** Árbol de Ana: «Proyectos» con «Acme» dentro, un archivo en cada una y dos archivos sueltos en su raíz. */
interface AnaTree {
  readonly projects: string;
  readonly acme: string;
  readonly inProjects: string;
  readonly inAcme: string;
  readonly report: string;
  readonly privateFile: string;
  readonly privateFolder: string;
}

const NOT_FOUND = { status: 404, code: 'STORAGE_NODE_NOT_FOUND' };

const statusAndCode = (response: Response): { status: number; code: unknown } => ({
  status: response.status,
  code: (response.body as { code?: unknown }).code,
});

const idsOf = (contents: FolderContentsResponse): string[] =>
  contents.items.map((item) => item.id).sort();

/**
 * Lo que el destinatario abre de lo compartido por HTTP (spec 012 CA-12, CA-13; plan §2 «contracts (storage)», R-2):
 * contenido con su `accessLevel`, migas que empiezan en la carpeta compartida, descarga de la versión vigente y una
 * raíz de «Mis archivos» que sigue siendo solo suya, sin tocar su espacio. Ana comparte «Proyectos» con Bruno como
 * Lector (y «Acme» además como Editor) y con Carla como Editora; Dani no recibe nada.
 */
describe('lo compartido abierto por el destinatario (012 CA-12, CA-13)', () => {
  let storage: StorageHttpApp;
  let ana: StorageClient;
  let bruno: StorageClient;
  let carla: StorageClient;
  let dani: StorageClient;
  let tree: AnaTree;

  const contentsOf = async (
    client: StorageClient,
    folderId?: string,
  ): Promise<FolderContentsResponse> => {
    const response = await client.folderContents(folderId === undefined ? {} : { folderId });
    expect(response.status).toBe(200);
    return folderContentsResponseSchema.parse(response.body);
  };

  const detailOf = async (client: StorageClient, fileId: string): Promise<FileDetailResponse> => {
    const response = await client.fileDetail(fileId);
    expect(response.status).toBe(200);
    return fileDetailResponseSchema.parse(response.body);
  };

  /** Un archivo suelto de Ana en su raíz, compartido con Bruno como Lector; devuelve su id y el de la fila. */
  const sharedLooseFile = async (name: string): Promise<{ fileId: string; shareId: string }> => {
    const { fileId } = await insertCommittedFile(storage.owner, ana.id, { folderId: null, name });
    return { fileId, shareId: await share(bruno.id, { fileId }, 'VIEWER') };
  };

  const seedAnaTree = async (): Promise<AnaTree> => {
    const [projects, acme, privateFolder] = await storage.owner.transaction(async (manager) => {
      const root = await insertFolder(manager, ana.id, { name: 'Proyectos' });
      const child = await insertFolder(manager, ana.id, { name: 'Acme', parent: root });
      return [root, child, await insertFolder(manager, ana.id, { name: 'Privada' })];
    });
    const file = (folderId: string | null, name: string) =>
      insertCommittedFile(storage.owner, ana.id, { folderId, name });
    return {
      projects: projects.id,
      acme: acme.id,
      privateFolder: privateFolder.id,
      inProjects: (await file(projects.id, 'plan.pdf')).fileId,
      inAcme: (await file(acme.id, 'contrato.pdf')).fileId,
      report: (await file(null, 'informe.pdf')).fileId,
      privateFile: (await file(null, 'privado.pdf')).fileId,
    };
  };

  const share = (
    granteeId: string,
    node: { fileId: string } | { folderId: string },
    level: string,
  ) => insertShare(storage.owner, { ownerId: ana.id, granteeId, node, level });

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    [ana, bruno, carla, dani] = [
      await storage.newClient(),
      await storage.newClient(),
      await storage.newClient(),
      await storage.newClient(),
    ];
    tree = await seedAnaTree();
    await share(bruno.id, { folderId: tree.projects }, 'VIEWER');
    await share(bruno.id, { folderId: tree.acme }, 'EDITOR');
    await share(bruno.id, { fileId: tree.report }, 'VIEWER');
    await share(carla.id, { folderId: tree.projects }, 'EDITOR');
  });

  afterAll(async () => {
    await storage?.close();
  });

  it('CA-13: el Lector abre la carpeta compartida: su contenido, migas que empiezan en ella y `accessLevel` VIEWER', async () => {
    const contents = await contentsOf(bruno, tree.projects);

    expect(contents.folder).toEqual({ id: tree.projects, name: 'Proyectos' });
    expect(contents.breadcrumbs).toEqual([{ id: tree.projects, name: 'Proyectos' }]);
    expect(idsOf(contents)).toEqual([tree.acme, tree.inProjects].sort());
    expect(contents.accessLevel).toBe('VIEWER');
  });

  it('CA-13: en la subcarpeta, las migas siguen desde la compartida y manda el nivel mayor (directo EDITOR)', async () => {
    const contents = await contentsOf(bruno, tree.acme);

    expect(contents.breadcrumbs.map((crumb) => crumb.id)).toEqual([tree.projects, tree.acme]);
    expect(idsOf(contents)).toEqual([tree.inAcme]);
    expect(contents.accessLevel).toBe('EDITOR');
  });

  it('CA-13: la Editora ve `accessLevel` EDITOR y la propietaria OWNER, también en su raíz', async () => {
    expect((await contentsOf(carla, tree.projects)).accessLevel).toBe('EDITOR');
    expect((await contentsOf(ana, tree.projects)).accessLevel).toBe('OWNER');
    expect((await contentsOf(ana)).accessLevel).toBe('OWNER');
  });

  it('CA-12: la raíz de «Mis archivos» del destinatario no muestra nada de Ana, aunque Ana lo comparta desde su raíz', async () => {
    const root = await contentsOf(bruno);

    expect(root.items).toEqual([]);
    expect(root.accessLevel).toBe('OWNER');
  });

  it('CA-12: el destinatario descarga lo compartido (directo y dentro de la carpeta) con una URL de 5 min', async () => {
    for (const fileId of [tree.report, tree.inAcme]) {
      const response = await bruno.downloadUrl(fileId);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ url: expect.any(String) as string });
    }
  });

  it('CA-12: lo no compartido de Ana es el 404 de lo inexistente, para Bruno y para Dani', async () => {
    expect(statusAndCode(await bruno.folderContents({ folderId: tree.privateFolder }))).toEqual(
      NOT_FOUND,
    );
    expect(statusAndCode(await bruno.downloadUrl(tree.privateFile))).toEqual(NOT_FOUND);
    expect(statusAndCode(await dani.folderContents({ folderId: tree.projects }))).toEqual(
      NOT_FOUND,
    );
    expect(statusAndCode(await dani.downloadUrl(tree.report))).toEqual(NOT_FOUND);
  });

  it('CA-12: lo compartido no cuenta en el espacio del destinatario ni en su cuota', async () => {
    await bruno.downloadUrl(tree.report);
    const summary = spaceSummaryResponseSchema.parse((await bruno.spaceSummary()).body);
    const [usage] = (await storage.owner.query(
      'SELECT espacio_usado::text AS used FROM usuario WHERE id = $1',
      [bruno.id],
    )) as { used: string }[];

    expect(summary.usedBytes).toBe(0);
    expect(usage?.used).toBe('0');
  });

  it('CA-13: un archivo que sale de la carpeta compartida deja de verse; al volver, vuelve', async () => {
    expect((await ana.moveFile(tree.inProjects, { folderId: null })).status).toBe(200);
    const outside = await bruno.downloadUrl(tree.inProjects);
    expect((await ana.moveFile(tree.inProjects, { folderId: tree.projects })).status).toBe(200);

    expect(statusAndCode(outside)).toEqual(NOT_FOUND);
    expect((await bruno.downloadUrl(tree.inProjects)).status).toBe(200);
  });

  it('CA-13: la carpeta en la papelera deja de verse con su contenido; al restaurarla, vuelve', async () => {
    expect((await ana.trashFolder(tree.acme)).status).toBe(200);
    const trashed = [
      await bruno.folderContents({ folderId: tree.acme }),
      await bruno.downloadUrl(tree.inAcme),
    ];
    expect((await ana.restoreFolder(tree.acme)).status).toBe(200);

    expect(trashed.map(statusAndCode)).toEqual([NOT_FOUND, NOT_FOUND]);
    expect(idsOf(await contentsOf(bruno, tree.acme))).toEqual([tree.inAcme]);
  });

  it('CA-12: la ficha del archivo da el `FileSummary` con `accessLevel` OWNER, VIEWER (directo) y EDITOR (heredado)', async () => {
    const owned = await detailOf(ana, tree.inAcme);

    expect(owned.file).toMatchObject({
      id: tree.inAcme,
      name: 'contrato.pdf',
      folderId: tree.acme,
    });
    expect(owned.accessLevel).toBe('OWNER');
    expect((await detailOf(bruno, tree.report)).accessLevel).toBe('VIEWER');
    expect(await detailOf(carla, tree.inProjects)).toEqual({
      file: (await detailOf(ana, tree.inProjects)).file,
      accessLevel: 'EDITOR',
    });
  });

  it('CA-12: la ficha de lo no compartido es el 404 de lo inexistente', async () => {
    expect(statusAndCode(await bruno.fileDetail(tree.privateFile))).toEqual(NOT_FOUND);
    expect(statusAndCode(await dani.fileDetail(tree.report))).toEqual(NOT_FOUND);
    expect(statusAndCode(await bruno.fileDetail(randomUUID()))).toEqual(NOT_FOUND);
  });

  it('CA-12, CA-13: la ficha de un archivo compartido en la papelera es 404 para el destinatario', async () => {
    const { fileId } = await sharedLooseFile('papelera.pdf');
    expect((await detailOf(bruno, fileId)).accessLevel).toBe('VIEWER');

    expect((await ana.trashFile(fileId)).status).toBe(200);

    expect(statusAndCode(await bruno.fileDetail(fileId))).toEqual(NOT_FOUND);
  });

  it('CA-10, CA-12: tras revocar el acceso, la ficha es 404 en la siguiente petición', async () => {
    const { fileId, shareId } = await sharedLooseFile('revocado.pdf');
    expect((await bruno.fileDetail(fileId)).status).toBe(200);

    await storage.owner.query('DELETE FROM comparticion WHERE id = $1', [shareId]);

    expect(statusAndCode(await bruno.fileDetail(fileId))).toEqual(NOT_FOUND);
  });

  it('CA-14: el historial sigue siendo solo de la propietaria aunque el destinatario abra la ficha', async () => {
    expect((await bruno.fileDetail(tree.report)).status).toBe(200);
    expect(statusAndCode(await bruno.fileVersions(tree.report))).toEqual(NOT_FOUND);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'CA-12: el rol interno %s recibe 403 SHARED_FORBIDDEN en la ficha',
    async (role) => {
      const internal = await storage.newClient(role);

      expect(statusAndCode(await internal.fileDetail(tree.report))).toEqual({
        status: 403,
        code: 'SHARED_FORBIDDEN',
      });
    },
  );
});
