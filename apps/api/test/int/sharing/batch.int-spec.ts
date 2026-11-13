import { batchDownloadResponseSchema, batchResultSchema } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';

import { insertCommittedFile } from '../storage/storage-http';
import type { StorageClient } from '../storage/storage-http';
import { insertFolder } from '../storage/storage-test-db';

import { createSharingHttpApp } from './sharing-http';
import type { SharingHttpApp } from './sharing-http';

const API_PREFIX = '/api/v1';

/**
 * Lotes del explorador por HTTP (mover, papelera, descarga y compartir varios nodos): cada elemento pasa por la regla de
 * su ruta individual con `accessibleNodes(actor)`, y lo ajeno falla con el mismo 404 uniforme sin frenar al resto.
 */
describe('lotes del explorador (nodes/batch y shares/batch)', () => {
  let app: SharingHttpApp;
  let ana: StorageClient;
  let bruno: StorageClient;

  const post = (client: StorageClient, route: string, body: object): Promise<Response> =>
    request(app.storage.testApp.app.getHttpServer())
      .post(`${API_PREFIX}/${route}`)
      .set({ Authorization: `Bearer ${app.storage.tokenOf(client.id) ?? ''}` })
      .send(body);

  const fileOf = async (client: StorageClient, name: string, folderId: string | null = null) =>
    ({
      type: 'file',
      id: (await insertCommittedFile(app.storage.owner, client.id, { folderId, name })).fileId,
    }) as const;

  const folderOf = async (client: StorageClient, name: string) =>
    ({
      type: 'folder',
      id: (await insertFolder(app.storage.owner, client.id, { name })).id,
    }) as const;

  beforeAll(async () => {
    app = await createSharingHttpApp();
    [ana, bruno] = [await app.storage.newClient(), await app.storage.newClient()];
  });

  afterAll(async () => {
    await app?.close();
  });

  it('mover: lo propio llega al destino y lo ajeno falla con STORAGE_NODE_NOT_FOUND', async () => {
    const target = await folderOf(ana, 'Destino');
    const mine = await fileOf(ana, 'mio.pdf');
    const foreign = await fileOf(bruno, 'ajeno.pdf');

    const response = await post(ana, 'nodes/batch/move', {
      items: [mine, foreign],
      targetFolderId: target.id,
    });

    expect(response.status).toBe(200);
    expect(batchResultSchema.parse(response.body)).toEqual({
      succeeded: [mine],
      failed: [{ ...foreign, code: 'STORAGE_NODE_NOT_FOUND' }],
    });
    const rows = (await app.storage.owner.query('SELECT carpeta_id FROM archivo WHERE id = $1', [
      foreign.id,
    ])) as { carpeta_id: string | null }[];
    expect(rows).toEqual([{ carpeta_id: null }]);
  });

  it('papelera: envía lo propio a la papelera como DELETE individual', async () => {
    const mine = await folderOf(ana, 'Vieja');
    const foreign = await folderOf(bruno, 'De Bruno');

    const response = await post(ana, 'nodes/batch/delete', { items: [mine, foreign] });

    expect(response.status).toBe(200);
    expect(batchResultSchema.parse(response.body)).toEqual({
      succeeded: [mine],
      failed: [{ ...foreign, code: 'STORAGE_NODE_NOT_FOUND' }],
    });
  });

  it('descarga: una URL prefirmada por archivo, también los de una carpeta; lo ajeno falla', async () => {
    const folder = await folderOf(ana, 'Informes');
    const inside = await fileOf(ana, 'dentro.pdf', folder.id);
    const loose = await fileOf(ana, 'suelto.pdf');
    const foreign = await fileOf(bruno, 'ajeno-descarga.pdf');

    const response = await post(ana, 'nodes/batch/download', { items: [loose, folder, foreign] });

    expect(response.status).toBe(200);
    const body = batchDownloadResponseSchema.parse(response.body);
    expect(body.downloads.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: loose.id, name: 'suelto.pdf' },
      { id: inside.id, name: 'dentro.pdf' },
    ]);
    expect(body.failed).toEqual([{ ...foreign, code: 'STORAGE_NODE_NOT_FOUND' }]);
  });

  it('un lote vacío o de un tipo desconocido es 400 sin tocar nada', async () => {
    const empty = await post(ana, 'nodes/batch/delete', { items: [] });
    const unknown = await post(ana, 'nodes/batch/delete', {
      items: [{ type: 'link', id: '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f' }],
    });

    expect([empty.status, unknown.status]).toEqual([400, 400]);
  });

  it('compartir: comparte lo propio con la persona y lo ajeno falla con el 404 de `POST /shares`', async () => {
    const mine = await folderOf(ana, 'Equipo');
    const foreign = await fileOf(bruno, 'privado.pdf');
    const email = await app.emailOf(bruno.id);

    const response = await post(ana, 'shares/batch', {
      items: [mine, foreign],
      email,
      level: 'EDITOR',
    });

    expect(response.status).toBe(200);
    const body = batchResultSchema.parse(response.body);
    expect(body.succeeded).toEqual([mine]);
    expect(body.failed).toEqual([
      { ...foreign, code: expect.stringMatching(/NOT_FOUND$/) as string },
    ]);
    const shares = (await app.storage.owner.query(
      'SELECT nivel FROM comparticion WHERE carpeta_id = $1 AND destinatario_id = $2',
      [mine.id, bruno.id],
    )) as { nivel: string }[];
    expect(shares).toEqual([{ nivel: 'EDITOR' }]);
  });
});
