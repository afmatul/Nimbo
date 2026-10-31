import { randomUUID } from 'node:crypto';

import request from 'supertest';
import type { Response } from 'supertest';

import { FixedClock, Role } from '../../../src/shared';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { describeRoute, listRouteDeclarations } from '../../support/route-declarations';
import { TestAccessTokens } from '../../support/test-access-tokens';

import { createStorageHttpApp, insertCommittedFile } from './storage-http';
import type { StorageHttpApp } from './storage-http';
import { insertFolder, insertUpload } from './storage-test-db';

const API = '/api/v1';
const TEAM_ID = '10000000-0000-4000-8000-000000000003';
const DAY_MS = 86_400_000;
const READ_ONLY_CODE = 'STORAGE_ACCOUNT_READ_ONLY';

/** Los ids que las rutas usan: un archivo vivo, una carpeta viva, lo que está en la papelera y una carga activa. */
interface Fixtures {
  readonly fileId: string;
  readonly versionId: string;
  readonly folderId: string;
  readonly trashedFileId: string;
  readonly trashedFolderId: string;
  readonly uploadId: string;
}

type Method = 'post' | 'put' | 'patch' | 'delete';

/** Una ruta de escritura de `storage`: cómo llamarla con los *fixtures* y el cuerpo válido que pide. */
interface WriteRoute {
  readonly method: Method;
  readonly path: string;
  readonly url: (ids: Fixtures) => string;
  readonly body?: object;
}

const route = (
  method: Method,
  path: string,
  url: WriteRoute['url'],
  body?: object,
): WriteRoute => ({
  method,
  path,
  url,
  ...(body === undefined ? {} : { body }),
});

/** ADR-0032 regla 3 y spec 010 CA-13: las diez que la solo lectura bloquea. */
const BLOCKED: readonly WriteRoute[] = [
  route('post', '/uploads', () => '/uploads', {
    name: 'nuevo.pdf',
    sizeBytes: 1024,
    onConflict: 'ask',
    folderId: null,
  }),
  route('post', '/uploads/:uploadId/complete', (ids) => `/uploads/${ids.uploadId}/complete`),
  route('post', '/folders', () => '/folders', { name: 'Nueva', parentId: null }),
  route('patch', '/folders/:folderId', (ids) => `/folders/${ids.folderId}`, { name: 'Otra' }),
  route('post', '/folders/:folderId/move', (ids) => `/folders/${ids.folderId}/move`, {
    parentId: null,
  }),
  route('patch', '/files/:fileId', (ids) => `/files/${ids.fileId}`, {
    name: 'otro.pdf',
    onConflict: 'ask',
  }),
  route('post', '/files/:fileId/move', (ids) => `/files/${ids.fileId}/move`, {
    folderId: null,
    onConflict: 'ask',
  }),
  route(
    'post',
    '/files/:fileId/versions/:versionId/restore',
    (ids) => `/files/${ids.fileId}/versions/${ids.versionId}/restore`,
  ),
  route(
    'post',
    '/trash/files/:fileId/restore',
    (ids) => `/trash/files/${ids.trashedFileId}/restore`,
  ),
  route(
    'post',
    '/trash/folders/:folderId/restore',
    (ids) => `/trash/folders/${ids.trashedFolderId}/restore`,
  ),
];

/**
 * RN-6 y ADR-0032 regla 3: las que siguen abiertas (lectura, descarga, papelera, accesos rápidos, resume y cancel).
 * La restauración de Soporte (`POST /backoffice/client-trash/:nodeId/restore`, 011b RN-3) también se permite en solo
 * lectura, pero es de `backoffice` y este arnés solo monta `storage`: la cubre `client-trash.int-spec.ts` (RN-3).
 */
const ALLOWED: readonly WriteRoute[] = [
  route('post', '/files/:fileId/download-url', (ids) => `/files/${ids.fileId}/download-url`),
  route(
    'post',
    '/files/:fileId/versions/:versionId/download-url',
    (ids) => `/files/${ids.fileId}/versions/${ids.versionId}/download-url`,
  ),
  route(
    'put',
    '/quick-access/pins/:nodeType/:nodeId',
    (ids) => `/quick-access/pins/files/${ids.fileId}`,
  ),
  route(
    'delete',
    '/quick-access/pins/:nodeType/:nodeId',
    (ids) => `/quick-access/pins/files/${ids.fileId}`,
  ),
  route(
    'post',
    '/quick-access/recents/:nodeType/:nodeId',
    (ids) => `/quick-access/recents/files/${ids.fileId}`,
  ),
  route('post', '/uploads/:uploadId/resume', (ids) => `/uploads/${ids.uploadId}/resume`),
  route('delete', '/uploads/:uploadId', (ids) => `/uploads/${ids.uploadId}`),
  route('delete', '/trash/files/:fileId', (ids) => `/trash/files/${ids.trashedFileId}`),
  route('delete', '/trash/folders/:folderId', (ids) => `/trash/folders/${ids.trashedFolderId}`),
  route('delete', '/files/:fileId', (ids) => `/files/${ids.fileId}`),
  route('delete', '/folders/:folderId', (ids) => `/folders/${ids.folderId}`),
  route('delete', '/trash', () => '/trash'),
];

/** Rutas del arnés de pruebas, que no son de `storage`. */
const HARNESS_ROUTES = new Set(['POST /api/v1/__probe/actor']);

const describeWrite = ({ method, path }: WriteRoute): string =>
  `${method.toUpperCase()} ${API}${path}`;

/** Solo lectura en `storage` de punta a punta (spec 010 CA-10, CA-12, CA-13; RN-6; ADR-0032) con `billing` real. */
describe('cuenta en solo lectura en `storage` (spec 010 CA-10, CA-12, CA-13, RN-6; ADR-0032)', () => {
  let storage: StorageHttpApp;
  let accountId: string;
  let token: string;
  let ids: Fixtures;

  const call = (method: Method | 'get', url: string, body?: object): Promise<Response> =>
    request(storage.testApp.app.getHttpServer())
      [method](`${API}${url}`)
      .set({ Authorization: `Bearer ${token}` })
      .send(body) as unknown as Promise<Response>;

  const setReadOnly = (readOnly: boolean): Promise<unknown> =>
    storage.owner.query(
      `UPDATE suscripcion SET estado = $2, vence_en = $3, iniciado_en = $4 WHERE usuario_id = $1`,
      readOnly
        ? [
            accountId,
            'solo_lectura',
            new Date(Date.now() - DAY_MS),
            new Date(Date.now() - 31 * DAY_MS),
          ]
        : [accountId, 'vigente', new Date(Date.now() + 29 * DAY_MS), new Date(Date.now() - DAY_MS)],
    );

  beforeAll(async () => {
    storage = await createStorageHttpApp({ realPlanLimits: true });
    accountId = (await storage.newClient()).id;
    token = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START)).valid({
      userId: accountId,
      role: Role.CLIENT,
      sessionId: randomUUID(),
    });
    await storage.owner.query(
      `INSERT INTO suscripcion (usuario_id, plan_id, iniciado_en, vence_en) VALUES ($1, $2, now(), now())`,
      [accountId, TEAM_ID],
    );
    await setReadOnly(true);
    const file = await insertCommittedFile(storage.owner, accountId, { name: 'informe.pdf' });
    const folder = await insertFolder(storage.owner, accountId, { name: 'Proyectos' });
    const deletedAt = new Date();
    const trashed = await insertCommittedFile(storage.owner, accountId, { deletedAt });
    const trashedFolder = await insertFolder(storage.owner, accountId, { deletedAt });
    ids = {
      fileId: file.fileId,
      versionId: file.versionId,
      folderId: folder.id,
      trashedFileId: trashed.fileId,
      trashedFolderId: trashedFolder.id,
      uploadId: await insertUpload(storage.owner, accountId),
    };
  });

  afterAll(async () => {
    await storage?.close();
  });

  it('ADR-0032 regla 3: toda ruta de escritura de `storage` está en la lista de bloqueadas o en la de permitidas', () => {
    const declared = listRouteDeclarations(storage.testApp.app, 'api/v1')
      .filter((declaration) => declaration.method !== 'GET')
      .map(describeRoute)
      .filter((declaration) => !HARNESS_ROUTES.has(declaration))
      .sort();
    const classified = [...BLOCKED, ...ALLOWED].map(describeWrite).sort();

    expect(BLOCKED).toHaveLength(10);
    expect([...new Set(classified)]).toEqual(declared);
  });

  it('CA-12, CA-14: el resumen de espacio dice `readOnly` y conserva la cuota de Equipo', async () => {
    const response = await call('get', '/storage/summary');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ readOnly: true, planName: 'Equipo' });
  });

  it.each(BLOCKED.map((write) => [describeWrite(write), write] as const))(
    'CA-13: %s es 403 STORAGE_ACCOUNT_READ_ONLY',
    async (_name, write) => {
      const response = await call(write.method, write.url(ids), write.body);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: READ_ONLY_CODE,
        message:
          'Tu suscripción venció y tu cuenta está en solo lectura. Renueva tu plan para volver a subir, editar y compartir.',
      });
    },
  );

  it('CA-13: nada cambió: nombres, carpetas, papelera y la carga activa siguen igual', async () => {
    const [state] = (await storage.owner.query(
      `SELECT (SELECT nombre FROM archivo WHERE id = $1) AS archivo,
              (SELECT nombre FROM carpeta WHERE id = $2) AS carpeta,
              (SELECT count(*)::int FROM carpeta WHERE propietario_id = $3) AS carpetas,
              (SELECT eliminado_en IS NOT NULL FROM archivo WHERE id = $4) AS en_papelera,
              (SELECT estado FROM carga WHERE id = $5) AS carga`,
      [ids.fileId, ids.folderId, accountId, ids.trashedFileId, ids.uploadId],
    )) as {
      archivo: string;
      carpeta: string;
      carpetas: number;
      en_papelera: boolean;
      carga: string;
    }[];

    expect(state).toEqual({
      archivo: 'informe.pdf',
      carpeta: 'Proyectos',
      carpetas: 2,
      en_papelera: true,
      carga: 'activa',
    });
  });

  it('CA-12: listar la carpeta y descargar siguen abiertos', async () => {
    expect((await call('get', '/folders/contents')).status).toBe(200);
    expect((await call('post', `/files/${ids.fileId}/download-url`)).status).toBe(200);
  });

  it.each(ALLOWED.map((write) => [describeWrite(write), write] as const))(
    'RN-6: %s no responde STORAGE_ACCOUNT_READ_ONLY',
    async (_name, write) => {
      const response = await call(write.method, write.url(ids), write.body);

      expect((response.body as { code?: string }).code).not.toBe(READ_ONLY_CODE);
      expect(response.status).not.toBe(403);
    },
  );

  it('CA-10: al renovar (cuenta vigente de nuevo) la carga vuelve a aceptarse', async () => {
    await setReadOnly(false);

    const response = await call('post', '/uploads', {
      name: 'despues.pdf',
      sizeBytes: 1024,
      onConflict: 'ask',
      folderId: null,
    });

    expect(response.status).toBe(201);
    await call('delete', `/uploads/${(response.body as { uploadId: string }).uploadId}`);
  });
});
