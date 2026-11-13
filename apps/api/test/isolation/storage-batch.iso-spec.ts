import { randomUUID } from 'node:crypto';

import {
  BATCH_MAX_ITEMS,
  batchDownloadResponseSchema,
  batchResultSchema,
  folderContentsResponseSchema,
} from '@nimbo/contracts';
import type { BatchItem } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { createSharingHttpApp } from '../int/sharing/sharing-http';
import type { SharingHttpApp } from '../int/sharing/sharing-http';
import { insertShare } from '../int/sharing/sharing-test-db';
import type { StorageClient } from '../int/storage/storage-http';
import { insertFileWithVersion, insertFolder } from '../int/storage/storage-test-db';

import { INTERNAL_ROLES } from './setup/isolation-assertions';

const API_PREFIX = '/api/v1';
/** Límites altos: la suite mide respuestas, no las tasas (ya probadas en sus suites). */
const GENEROUS_LIMITS = {
  SHARING_RATE_LIMIT_PER_MINUTE: '1000',
  RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE: '1000',
};
const SAME_NAME = 'Contrato de arrendamiento.pdf';
const NOT_FOUND = 'STORAGE_NODE_NOT_FOUND';

/**
 * Lo de A: «Proyecto» (Lector para B) con «Anexos» dentro, un archivo suelto (Editor para B), una carpeta «Borradores»
 * (Editor para B) y lo que no comparte: «Privada» con un archivo dentro y un archivo suelto.
 */
interface WorldOfA {
  readonly shared: { readonly folder: string; readonly sub: string; readonly editorFolder: string };
  readonly files: { readonly inFolder: string; readonly inSub: string; readonly direct: string };
  readonly unshared: {
    readonly folder: string;
    readonly fileInFolder: string;
    readonly file: string;
  };
}

const seedA = (owner: DataSource, a: string, b: string, c: string): Promise<WorldOfA> =>
  owner.transaction(async (m) => {
    const project = await insertFolder(m, a, { name: 'Proyecto' });
    const sub = await insertFolder(m, a, { name: 'Anexos', parent: project });
    const editorFolder = await insertFolder(m, a, { name: 'Borradores' });
    const privateFolder = await insertFolder(m, a, { name: 'Privada' });
    const file = async (name: string, folderId: string | null = null) =>
      (await insertFileWithVersion(m, a, { name, folderId })).fileId;
    const files = {
      inFolder: await file(SAME_NAME, project.id),
      inSub: await file('anexo.pdf', sub.id),
      direct: await file(SAME_NAME),
    };
    const share = (node: { fileId: string } | { folderId: string }, level: string, to = b) =>
      insertShare(m, { ownerId: a, granteeId: to, node, level });
    await share({ folderId: project.id }, 'VIEWER');
    await share({ fileId: files.direct }, 'EDITOR');
    await share({ folderId: editorFolder.id }, 'EDITOR');
    // A también comparte con C un archivo dentro de «Proyecto»: para A está «Compartido», para B nunca.
    await share({ fileId: files.inFolder }, 'VIEWER', c);
    return {
      shared: { folder: project.id, sub: sub.id, editorFolder: editorFolder.id },
      files,
      unshared: {
        folder: privateFolder.id,
        fileInFolder: await file('nomina.pdf', privateFolder.id),
        file: await file('Nómina.pdf'),
      },
    };
  });

/** Todos los nodos de A como elementos de lote, compartidos con B o no. */
const everyItemOf = (world: WorldOfA): BatchItem[] => [
  ...Object.values(world.shared).map((id) => ({ type: 'folder' as const, id })),
  { type: 'folder', id: world.unshared.folder },
  ...Object.values(world.files).map((id) => ({ type: 'file' as const, id })),
  { type: 'file', id: world.unshared.file },
  { type: 'file', id: world.unshared.fileInFolder },
];

/** Estado de A que ningún lote de otra cuenta puede cambiar: nodos, borrado lógico y comparticiones. */
const A_STATE_SQL = `
  SELECT id, nombre, carpeta_padre_id AS padre, eliminado_en FROM carpeta WHERE propietario_id = $1
  UNION ALL
  SELECT id, nombre, carpeta_id, eliminado_en FROM archivo WHERE propietario_id = $1
  UNION ALL
  SELECT id, destinatario_id::text, nivel, NULL FROM comparticion WHERE propietario_id = $1
  ORDER BY id`;

const failureCodes = (response: Response): Record<string, string> => {
  const body = batchResultSchema.parse(response.body);
  return Object.fromEntries(body.failed.map((failure) => [failure.id, failure.code]));
};

/**
 * Aislamiento de los lotes del explorador (`POST /nodes/batch/{move,delete,download}` y `POST /shares/batch`): cada
 * elemento se resuelve con `accessibleNodes(actor)` / `PermissionResolver`, lo ajeno falla con el mismo código que un id
 * inexistente y nada de A cambia. A comparte con B; C no tiene nada. Las *fixtures* se insertan como el dueño; la app
 * corre como `nimbo_app`.
 */
describe('aislamiento de los lotes del explorador', () => {
  let sharing: SharingHttpApp;
  let a: StorageClient;
  let b: StorageClient;
  let c: StorageClient;
  let world: WorldOfA;
  let ownOfB: { readonly folder: string; readonly file: string };
  let stateBefore: unknown[];

  const post = (client: StorageClient, route: string, body: object): Promise<Response> =>
    request(sharing.storage.testApp.app.getHttpServer())
      .post(`${API_PREFIX}/${route}`)
      .set({ Authorization: `Bearer ${sharing.storage.tokenOf(client.id) ?? ''}` })
      .send(body);

  const stateOfA = (): Promise<unknown[]> =>
    sharing.storage.owner.query(A_STATE_SQL, [a.id]) as Promise<unknown[]>;

  const randomOf = (type: BatchItem['type']): BatchItem => ({ type, id: randomUUID() });

  beforeAll(async () => {
    sharing = await createSharingHttpApp({ env: GENEROUS_LIMITS });
    [a, b, c] = [
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
    ];
    world = await seedA(sharing.storage.owner, a.id, b.id, c.id);
    ownOfB = await sharing.storage.owner.transaction(async (m) => ({
      folder: (await insertFolder(m, b.id, { name: 'Proyecto' })).id,
      file: (await insertFileWithVersion(m, b.id, { name: SAME_NAME })).fileId,
    }));
    stateBefore = await stateOfA();
  });

  afterAll(async () => {
    await sharing?.close();
  });

  it('ISO-1: B no puede mover, enviar a la papelera ni compartir por lote nodos de A (mismo código que un id inexistente)', async () => {
    const items = [...everyItemOf(world), randomOf('file'), randomOf('folder')];
    const routes: readonly [string, object][] = [
      ['nodes/batch/move', { items, targetFolderId: null }],
      ['nodes/batch/move', { items, targetFolderId: ownOfB.folder }],
      ['nodes/batch/delete', { items }],
      ['shares/batch', { items, email: await sharing.emailOf(c.id), level: 'EDITOR' }],
    ];

    for (const [route, body] of routes) {
      const response = await post(b, route, body);
      expect({ route, status: response.status }).toEqual({ route, status: 200 });
      expect({ route, succeeded: batchResultSchema.parse(response.body).succeeded }).toEqual({
        route,
        succeeded: [],
      });
      const codes = failureCodes(response);
      const distinct = new Set(Object.values(codes));
      expect({ route, distinct: [...distinct] }).toEqual({ route, distinct: [NOT_FOUND] });
      expect(Object.keys(codes)).toHaveLength(items.length);
    }
    expect(await stateOfA()).toEqual(stateBefore);
  });

  it('ISO-2: B no puede mover nodos propios a una carpeta de A, ni compartida como Editor', async () => {
    const own: BatchItem[] = [
      { type: 'folder', id: ownOfB.folder },
      { type: 'file', id: ownOfB.file },
    ];
    const targets = [
      world.shared.editorFolder,
      world.shared.folder,
      world.shared.sub,
      world.unshared.folder,
      randomUUID(),
    ];

    for (const targetFolderId of targets) {
      const response = await post(b, 'nodes/batch/move', { items: own, targetFolderId });
      expect({ targetFolderId, status: response.status }).toEqual({ targetFolderId, status: 200 });
      expect({ targetFolderId, codes: failureCodes(response) }).toEqual({
        targetFolderId,
        codes: { [ownOfB.folder]: NOT_FOUND, [ownOfB.file]: NOT_FOUND },
      });
    }
    const placed = (await sharing.storage.owner.query(
      `SELECT carpeta_padre_id AS parent FROM carpeta WHERE id = $1
       UNION ALL SELECT carpeta_id FROM archivo WHERE id = $2`,
      [ownOfB.folder, ownOfB.file],
    )) as { parent: string | null }[];
    expect(placed).toEqual([{ parent: null }, { parent: null }]);
    expect(await stateOfA()).toEqual(stateBefore);
  });

  it('ISO-3: C no puede descargar por lote ningún archivo ni carpeta de A', async () => {
    const items = [...everyItemOf(world), randomOf('file'), randomOf('folder')];

    const response = await post(c, 'nodes/batch/download', { items });

    expect(response.status).toBe(200);
    const body = batchDownloadResponseSchema.parse(response.body);
    expect(body.downloads).toEqual([]);
    expect(body.failed.map((failure) => failure.code)).toEqual(items.map(() => NOT_FOUND));
    expect(JSON.stringify(response.body)).not.toContain(SAME_NAME);
  });

  it('ISO-4: B no puede descargar por lote fuera de lo compartido: la carpeta se expande solo a su subárbol', async () => {
    const response = await post(b, 'nodes/batch/download', {
      items: [
        { type: 'folder', id: world.shared.folder },
        { type: 'folder', id: world.unshared.folder },
        { type: 'file', id: world.unshared.file },
      ],
    });

    expect(response.status).toBe(200);
    const body = batchDownloadResponseSchema.parse(response.body);
    expect(body.downloads.map((entry) => entry.id).sort()).toEqual(
      [world.files.inFolder, world.files.inSub].sort(),
    );
    expect(body.failed).toEqual([
      { type: 'folder', id: world.unshared.folder, code: NOT_FOUND },
      { type: 'file', id: world.unshared.file, code: NOT_FOUND },
    ]);
    for (const entry of body.downloads) expect(entry.url).toContain(entry.id);
    expect(JSON.stringify(response.body)).not.toContain(world.unshared.fileInFolder);
  });

  it('ISO-5: C como Lector no puede mover, enviar a la papelera ni volver a compartir por lote lo que A le compartió', async () => {
    const item: BatchItem = { type: 'file', id: world.files.inFolder };
    const routes: readonly [string, object][] = [
      ['nodes/batch/move', { items: [item], targetFolderId: null }],
      ['nodes/batch/delete', { items: [item] }],
      ['shares/batch', { items: [item], email: await sharing.emailOf(b.id), level: 'VIEWER' }],
    ];

    for (const [route, body] of routes) {
      const response = await post(c, route, body);
      expect({ route, codes: failureCodes(response) }).toEqual({
        route,
        codes: { [item.id]: NOT_FOUND },
      });
    }
    expect(await stateOfA()).toEqual(stateBefore);
  });

  it.each(INTERNAL_ROLES)(
    'ISO-6: %s no puede usar los lotes del explorador (403) ni recibir nada de A',
    async (role) => {
      const internal = await sharing.storage.newClient(role);
      const items = everyItemOf(world);
      const routes: readonly [string, object][] = [
        ['nodes/batch/move', { items, targetFolderId: null }],
        ['nodes/batch/delete', { items }],
        ['nodes/batch/download', { items }],
        ['shares/batch', { items, email: await sharing.emailOf(b.id), level: 'VIEWER' }],
      ];

      for (const [route, body] of routes) {
        const response = await post(internal, route, body);
        expect({ route, status: response.status }).toEqual({ route, status: 403 });
        expect(JSON.stringify(response.body)).not.toMatch(/https?:\/\//);
        expect(JSON.stringify(response.body)).not.toContain(SAME_NAME);
      }
      expect(await stateOfA()).toEqual(stateBefore);
    },
  );

  it(`ISO-7: B no puede mandar un lote de más de ${String(BATCH_MAX_ITEMS)} elementos`, async () => {
    const items = Array.from({ length: BATCH_MAX_ITEMS + 1 }, () => randomOf('file'));
    const routes: readonly [string, object][] = [
      ['nodes/batch/move', { items, targetFolderId: null }],
      ['nodes/batch/delete', { items }],
      ['nodes/batch/download', { items }],
      ['shares/batch', { items, email: await sharing.emailOf(c.id), level: 'VIEWER' }],
    ];

    for (const [route, body] of routes) {
      expect({ route, status: (await post(b, route, body)).status }).toEqual({
        route,
        status: 400,
      });
    }
  });

  it('ISO-8: B no puede ver la marca «Compartido» de A: en lo compartido con B siempre es `false`', async () => {
    const ofB = folderContentsResponseSchema.parse(
      (await b.folderContents({ folderId: world.shared.folder })).body,
    );
    const ofA = folderContentsResponseSchema.parse(
      (await a.folderContents({ folderId: world.shared.folder })).body,
    );
    const rootOfA = folderContentsResponseSchema.parse((await a.folderContents()).body);

    expect(ofB.items.map((item) => item.shared)).toEqual(ofB.items.map(() => false));
    expect(ofA.items.find((item) => item.id === world.files.inFolder)?.shared).toBe(true);
    expect(rootOfA.items.find((item) => item.id === world.shared.folder)?.shared).toBe(true);
  });
});
