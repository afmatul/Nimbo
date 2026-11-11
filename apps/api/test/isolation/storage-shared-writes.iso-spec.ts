import { randomUUID } from 'node:crypto';

import request from 'supertest';
import type { Response } from 'supertest';

import { insertShare } from '../int/sharing/sharing-test-db';
import { createStorageHttpApp } from '../int/storage/storage-http';
import type { StorageHttpApp } from '../int/storage/storage-http';
import { insertFileWithVersion, insertFolder } from '../int/storage/storage-test-db';

import { comparable } from './setup/isolation-assertions';
import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld, WorldAccount } from './setup/isolation-world';

const API_PREFIX = '/api/v1';
const LEVELS = ['VIEWER', 'EDITOR'] as const;
type SharedLevel = (typeof LEVELS)[number];

interface RouteCall {
  readonly method: 'get' | 'post' | 'patch' | 'delete';
  readonly path: string;
  readonly body?: Record<string, unknown>;
}

/**
 * Lo que A comparte con B en un nivel: una carpeta con un archivo dentro, un archivo suelto con versión antigua y una
 * carpeta y un archivo en la papelera (la compartición se conserva, CA-18).
 */
interface SharedNodes {
  readonly folderId: string;
  readonly fileInFolderId: string;
  readonly fileId: string;
  readonly oldVersionId: string;
  readonly trashedFolderId: string;
  readonly trashedFileId: string;
}

/** Nombre del archivo dentro de la carpeta compartida, el que una carga con `onConflict: 'replace'` reemplazaría. */
const FILE_IN_FOLDER_NAME = 'contrato.pdf';

/** Lo propio de B, para moverlo a lo compartido. */
interface OwnNodes {
  readonly folderId: string;
  readonly fileId: string;
}

/** Ruta de escritura de `storage` sobre lo compartido: etiqueta y petición con el id de A (o uno inexistente). */
type SharedWriteRoute = readonly [
  label: string,
  call: (shared: SharedNodes, own: OwnNodes, id?: string) => RouteCall,
];

/**
 * Toda ruta de `storage` que escribe sobre un nodo, lo usa como destino o lee su historial (spec 012 CA-14; plan R-1).
 * Con `id` se reemplaza el nodo de A por un id inexistente, para comparar la respuesta.
 */
const SHARED_WRITE_ROUTES: readonly SharedWriteRoute[] = [
  [
    'PATCH /files/:id (archivo compartido)',
    (s, _o, id) => ({
      method: 'patch',
      path: `/files/${id ?? s.fileId}`,
      body: { name: 'Renombrado.pdf' },
    }),
  ],
  [
    'PATCH /files/:id (archivo dentro de la carpeta compartida)',
    (s, _o, id) => ({
      method: 'patch',
      path: `/files/${id ?? s.fileInFolderId}`,
      body: { name: 'Renombrado.pdf' },
    }),
  ],
  [
    'POST /files/:id/move (a la raíz)',
    (s, _o, id) => ({
      method: 'post',
      path: `/files/${id ?? s.fileInFolderId}/move`,
      body: { folderId: null },
    }),
  ],
  [
    'POST /files/:id/move (un archivo de B a la carpeta compartida)',
    (s, o, id) => ({
      method: 'post',
      path: `/files/${o.fileId}/move`,
      body: { folderId: id ?? s.folderId },
    }),
  ],
  ['DELETE /files/:id', (s, _o, id) => ({ method: 'delete', path: `/files/${id ?? s.fileId}` })],
  [
    'PATCH /folders/:id',
    (s, _o, id) => ({
      method: 'patch',
      path: `/folders/${id ?? s.folderId}`,
      body: { name: 'Renombrada' },
    }),
  ],
  [
    'POST /folders/:id/move (a la raíz)',
    (s, _o, id) => ({
      method: 'post',
      path: `/folders/${id ?? s.folderId}/move`,
      body: { parentId: null },
    }),
  ],
  [
    'POST /folders/:id/move (una carpeta de B a la carpeta compartida)',
    (s, o, id) => ({
      method: 'post',
      path: `/folders/${o.folderId}/move`,
      body: { parentId: id ?? s.folderId },
    }),
  ],
  [
    'POST /folders (dentro de la carpeta compartida)',
    (s, _o, id) => ({
      method: 'post',
      path: '/folders',
      body: { name: 'Intrusa', parentId: id ?? s.folderId },
    }),
  ],
  [
    'DELETE /folders/:id',
    (s, _o, id) => ({ method: 'delete', path: `/folders/${id ?? s.folderId}` }),
  ],
  [
    'POST /uploads (en la carpeta compartida)',
    (s, _o, id) => ({
      method: 'post',
      path: '/uploads',
      body: { name: 'nuevo.txt', sizeBytes: 10, folderId: id ?? s.folderId },
    }),
  ],
  [
    "POST /uploads (reemplazar el archivo de la carpeta compartida, `onConflict: 'replace'`)",
    (s, _o, id) => ({
      method: 'post',
      path: '/uploads',
      body: {
        name: FILE_IN_FOLDER_NAME,
        sizeBytes: 10,
        folderId: id ?? s.folderId,
        onConflict: 'replace',
      },
    }),
  ],
  [
    'POST /trash/files/:id/restore',
    (s, _o, id) => ({ method: 'post', path: `/trash/files/${id ?? s.trashedFileId}/restore` }),
  ],
  [
    'POST /trash/folders/:id/restore',
    (s, _o, id) => ({ method: 'post', path: `/trash/folders/${id ?? s.trashedFolderId}/restore` }),
  ],
  [
    'GET /files/:id/versions (historial)',
    (s, _o, id) => ({ method: 'get', path: `/files/${id ?? s.fileId}/versions` }),
  ],
  [
    'POST /files/:id/versions/:versionId/restore',
    (s, _o, id) => ({
      method: 'post',
      path: `/files/${id ?? s.fileId}/versions/${s.oldVersionId}/restore`,
    }),
  ],
  [
    'POST /files/:id/versions/:versionId/download-url (versión antigua)',
    (s, _o, id) => ({
      method: 'post',
      path: `/files/${id ?? s.fileId}/versions/${s.oldVersionId}/download-url`,
    }),
  ],
];

/** Estado de A que ningún intento de B puede cambiar: nodos, versiones y nodos ajenos colgados de sus carpetas. */
const A_STATE_SQL = `
  SELECT id, nombre, carpeta_padre_id AS padre, ruta AS extra, eliminado_en FROM carpeta WHERE propietario_id = $1
  UNION ALL
  SELECT id, nombre, carpeta_id, version_actual_id::text, eliminado_en FROM archivo WHERE propietario_id = $1
  UNION ALL
  SELECT v.id, v.clave_objeto, v.archivo_id, v.numero::text, NULL FROM version_archivo v
    JOIN archivo a ON a.id = v.archivo_id WHERE a.propietario_id = $1
  UNION ALL
  SELECT n.id, n.nombre, n.carpeta_padre_id, 'ajena', NULL FROM carpeta n
    JOIN carpeta p ON p.id = n.carpeta_padre_id WHERE p.propietario_id = $1 AND n.propietario_id <> $1
  UNION ALL
  SELECT n.id, n.nombre, n.carpeta_id, 'ajeno', NULL FROM archivo n
    JOIN carpeta p ON p.id = n.carpeta_id WHERE p.propietario_id = $1 AND n.propietario_id <> $1
  ORDER BY id`;

/**
 * Escrituras de `storage` como Lector y Editor (spec 012 CA-14, plan §7 R-1): ninguna ruta que escribe, usa un nodo
 * compartido como destino o lee su historial deja pasar a B; responde el mismo 404 que con un id inexistente y nada de
 * A cambia. Las comparticiones y las *fixtures* se insertan como el dueño.
 */
describe('escrituras de `storage` sobre lo compartido (012 CA-14)', () => {
  let world: IsolationWorld;
  let storage: StorageHttpApp;
  let a: WorldAccount;
  let b: WorldAccount;
  let own: OwnNodes;
  const shared = {} as Record<SharedLevel, SharedNodes>;
  let stateBefore: unknown[];

  const send = (call: RouteCall, account: WorldAccount): Promise<Response> => {
    const pending = request(storage.testApp.app.getHttpServer())
      [call.method](`${API_PREFIX}${call.path}`)
      .set('Authorization', `Bearer ${world.tokenFor(account)}`);
    return call.body === undefined ? pending : pending.send(call.body);
  };

  const stateOfA = (): Promise<unknown[]> =>
    storage.owner.query(A_STATE_SQL, [a.id]) as Promise<unknown[]>;

  /** Carpeta con un archivo, un archivo suelto con dos versiones y dos nodos en la papelera, compartidos con B en `level`. */
  const shareWithB = (level: SharedLevel): Promise<SharedNodes> =>
    storage.owner.transaction(async (manager) => {
      const folder = await insertFolder(manager, a.id, { name: `Compartida ${level}` });
      const inFolder = await insertFileWithVersion(manager, a.id, {
        folderId: folder.id,
        name: FILE_IN_FOLDER_NAME,
      });
      const file = await insertFileWithVersion(manager, a.id);
      const current = randomUUID();
      await manager.query(
        `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero)
       VALUES ($1, $2, 'carga', $3, 1024, $4, now(), 2)`,
        [current, file.fileId, `u/${a.id}/${file.fileId}/${current}`, a.id],
      );
      await manager.query('UPDATE archivo SET version_actual_id = $2 WHERE id = $1', [
        file.fileId,
        current,
      ]);
      const deletedAt = new Date();
      const trashedFolder = await insertFolder(manager, a.id, { deletedAt });
      const trashedFile = await insertFileWithVersion(manager, a.id, { deletedAt });
      const share = { ownerId: a.id, granteeId: b.id, level };
      await insertShare(manager, { ...share, node: { folderId: folder.id } });
      await insertShare(manager, { ...share, node: { fileId: file.fileId } });
      await insertShare(manager, { ...share, node: { folderId: trashedFolder.id } });
      await insertShare(manager, { ...share, node: { fileId: trashedFile.fileId } });
      return {
        folderId: folder.id,
        fileInFolderId: inFolder.fileId,
        fileId: file.fileId,
        oldVersionId: file.versionId,
        trashedFolderId: trashedFolder.id,
        trashedFileId: trashedFile.fileId,
      };
    });

  beforeAll(async () => {
    world = await createIsolationWorld();
    storage = await createStorageHttpApp(world.appComposition());
    [a, b] = world.clients;
    for (const level of LEVELS) shared[level] = await shareWithB(level);
    own = await storage.owner.transaction(async (manager) => ({
      folderId: (await insertFolder(manager, b.id)).id,
      fileId: (await insertFileWithVersion(manager, b.id)).fileId,
    }));
    stateBefore = await stateOfA();
  });

  afterAll(async () => {
    await storage?.close();
    await world?.close();
  });

  describe.each(LEVELS)('como %s', (level) => {
    it.each(SHARED_WRITE_ROUTES)(
      'CA-14: %s es el mismo 404 que con un id inexistente',
      async (label, call) => {
        const onShared = await send(call(shared[level], own), b);
        const missing = await send(call(shared[level], own, randomUUID()), b);

        expect({ label, status: onShared.status, code: onShared.body.code }).toEqual({
          label,
          status: 404,
          code: 'STORAGE_NODE_NOT_FOUND',
        });
        expect(comparable(onShared)).toEqual(comparable(missing));
      },
    );
  });

  it('CA-14: tras todos los intentos de B, los nodos y las versiones de A siguen intactos', async () => {
    expect(await stateOfA()).toEqual(stateBefore);
  });
});
