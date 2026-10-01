import { randomUUID } from 'node:crypto';

import {
  fileSummarySchema,
  folderContentsResponseSchema,
  folderSummarySchema,
} from '@nimbo/contracts';
import type { FolderSummary } from '@nimbo/contracts';
import type { Response } from 'supertest';

import { createStorageHttpApp, insertCommittedFile, usedBytesOf } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

interface ErrorBody {
  readonly code: string;
  readonly correlationId: string;
  readonly details?: Record<string, unknown>;
}

const SIZE_BYTES = 2048n;

/** Renombrar y mover archivos por HTTP (plan 006 §4): caso feliz, nombre repetido con `suggestedName` y 404. */
describe('archivos en carpetas por HTTP (006 CA-4, CA-7)', () => {
  let storage: StorageHttpApp;
  let ana: StorageClient;
  let bruno: StorageClient;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    ana = await storage.newClient();
    bruno = await storage.newClient();
  });

  afterAll(async () => {
    await storage?.close();
  });

  const folder = async (client: StorageClient, name: string): Promise<FolderSummary> => {
    const response = await client.createFolder({ name, parentId: null });
    expect(response.status).toBe(201);
    return folderSummarySchema.parse(response.body);
  };

  const fileOf = async (
    client: StorageClient,
    name: string,
    folderId: string | null = null,
  ): Promise<string> => {
    const { fileId } = await insertCommittedFile(storage.owner, client.id, {
      name,
      folderId,
      sizeBytes: SIZE_BYTES,
    });
    return fileId;
  };

  const fileIdsIn = async (client: StorageClient, folderId?: string): Promise<string[]> => {
    const response = await client.folderContents(folderId === undefined ? {} : { folderId });
    expect(response.status).toBe(200);
    return folderContentsResponseSchema
      .parse(response.body)
      .items.filter((item) => item.type === 'file')
      .map((item) => item.id);
  };

  const expectError = (response: Response, status: number, code: string): ErrorBody => {
    expect(response.status).toBe(status);
    const body = response.body as ErrorBody;
    expect(body).toMatchObject({ code, correlationId: expect.any(String) as string });
    return body;
  };

  describe('PATCH /files/:fileId', () => {
    it('CA-4: renombra el archivo; el tipo y el tamaño no cambian', async () => {
      const fileId = await fileOf(ana, 'Borrador.txt');

      const response = await ana.renameFile(fileId, { name: 'Acta final.txt' });

      expect(response.status).toBe(200);
      expect(fileSummarySchema.parse(response.body)).toMatchObject({
        id: fileId,
        name: 'Acta final.txt',
        sizeBytes: Number(SIZE_BYTES),
        folderId: null,
      });
    });

    it('CA-4: un nombre ocupado en su carpeta es 409 con `suggestedName`; con `keep_both` queda «(n)»', async () => {
      const reports = await folder(ana, 'Informes');
      await fileOf(ana, 'Plan.txt', reports.id);
      const fileId = await fileOf(ana, 'Otro.txt', reports.id);

      const asked = await ana.renameFile(fileId, { name: 'PLAN.txt' });
      const kept = await ana.renameFile(fileId, { name: 'PLAN.txt', onConflict: 'keep_both' });

      expect(expectError(asked, 409, 'STORAGE_NAME_CONFLICT').details).toEqual({
        suggestedName: 'PLAN (1).txt',
      });
      expect(kept.status).toBe(200);
      expect(fileSummarySchema.parse(kept.body).name).toBe('PLAN (1).txt');
    });

    it('CA-4: un nombre inválido es 400 `STORAGE_INVALID_NODE_REQUEST`', async () => {
      const fileId = await fileOf(ana, 'Válido.txt');

      expectError(
        await ana.renameFile(fileId, { name: '..' }),
        400,
        'STORAGE_INVALID_NODE_REQUEST',
      );
    });

    it('CA-22: un archivo ajeno, inexistente o con id inválido es el mismo 404', async () => {
      const foreign = await fileOf(bruno, 'De Bruno.txt');

      for (const id of [foreign, randomUUID(), 'no-es-uuid']) {
        expectError(await ana.renameFile(id, { name: 'Mío.txt' }), 404, 'STORAGE_NODE_NOT_FOUND');
      }
    });
  });

  describe('POST /files/:fileId/move', () => {
    it('CA-7: aparece en el destino y deja el origen; `espacio_usado` no cambia', async () => {
      const client = await storage.newClient();
      const destination = await folder(client, 'Destino');
      const fileId = await fileOf(client, 'Mover.txt');
      const usedBefore = await usedBytesOf(storage.owner, client.id);

      const response = await client.moveFile(fileId, { folderId: destination.id });

      expect(response.status).toBe(200);
      expect(fileSummarySchema.parse(response.body).folderId).toBe(destination.id);
      await expect(fileIdsIn(client, destination.id)).resolves.toEqual([fileId]);
      await expect(fileIdsIn(client)).resolves.toEqual([]);
      expect(await usedBytesOf(storage.owner, client.id)).toBe(usedBefore);
    });

    it('CA-7: vuelve a la raíz con `folderId: null`', async () => {
      const source = await folder(ana, 'Origen');
      const fileId = await fileOf(ana, 'A la raíz.txt', source.id);

      const response = await ana.moveFile(fileId, { folderId: null });

      expect(response.status).toBe(200);
      expect(fileSummarySchema.parse(response.body).folderId).toBeNull();
    });

    it('CA-7: un nombre ocupado en el destino es 409 con `suggestedName`; con `keep_both` llega como «(n)»', async () => {
      const destination = await folder(ana, 'Con copia');
      await fileOf(ana, 'Repetido.txt', destination.id);
      const fileId = await fileOf(ana, 'repetido.txt');

      const asked = await ana.moveFile(fileId, { folderId: destination.id });
      const kept = await ana.moveFile(fileId, {
        folderId: destination.id,
        onConflict: 'keep_both',
      });

      expect(expectError(asked, 409, 'STORAGE_NAME_CONFLICT').details).toEqual({
        suggestedName: 'repetido (1).txt',
      });
      expect(fileSummarySchema.parse(kept.body)).toMatchObject({
        name: 'repetido (1).txt',
        folderId: destination.id,
      });
    });

    it('CA-22: un destino ajeno o inexistente es 404 y el archivo no se mueve', async () => {
      const foreign = await folder(bruno, 'Ajena');
      const fileId = await fileOf(ana, 'Quieto.txt');

      for (const folderId of [foreign.id, randomUUID()]) {
        expectError(await ana.moveFile(fileId, { folderId }), 404, 'STORAGE_NODE_NOT_FOUND');
      }
      await expect(fileIdsIn(ana)).resolves.toContain(fileId);
    });
  });
});
