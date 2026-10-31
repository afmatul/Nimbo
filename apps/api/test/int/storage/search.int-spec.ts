import { searchResponseSchema, STORAGE_SEARCH_FIELD_MESSAGES } from '@nimbo/contracts';
import type { SearchResponse } from '@nimbo/contracts';
import type { Response } from 'supertest';

import { Role } from '../../../src/shared';

import { createStorageHttpApp } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';
import { insertFileWithVersion, insertFolder } from './storage-test-db';

/** Nombres con marcas únicas, para buscarlas en cualquier línea de la bitácora (CA-15). */
const FOLDER_NAME = 'Camiones-reservado-8d1c';
const FILE_NAME = 'Informe del Camión-privado-3a9f.docx';
const TYPED_TEXT = 'camion informe-zz71';
const MIDDLE = '2026-10-02T09:00:00.000Z';

interface ErrorBody {
  readonly code: string;
  readonly fields?: readonly { field: string; reason: string; message: string }[];
}

const expectQueryError = (response: Response, field: string, reason: string): void => {
  expect(response.status).toBe(400);
  const body = response.body as ErrorBody;
  expect(body.code).toBe('STORAGE_INVALID_QUERY');
  expect(body.fields).toEqual([expect.objectContaining({ field, reason })]);
};

/** `GET /search` por HTTP con Postgres real (spec 018 CA-6, CA-9, CA-14, CA-15 y el caso feliz). */
describe('GET /search (018)', () => {
  let storage: StorageHttpApp;
  let ana: StorageClient;
  let folderId: string;
  let fileId: string;

  const bodyOf = (response: Response): SearchResponse => {
    expect(response.status).toBe(200);
    return searchResponseSchema.parse(response.body);
  };

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    ana = await storage.newClient();
    folderId = (await insertFolder(storage.owner, ana.id, { name: FOLDER_NAME })).id;
    fileId = (
      await storage.owner.transaction((manager) =>
        insertFileWithVersion(manager, ana.id, { name: FILE_NAME, folderId }),
      )
    ).fileId;
    await storage.owner.query('UPDATE archivo SET tipo = $2, actualizado_en = $3 WHERE id = $1', [
      fileId,
      'docx',
      MIDDLE,
    ]);
  });

  afterAll(async () => {
    await storage?.close();
  });

  describe('caso feliz', () => {
    it('CA-1, CA-2: devuelve carpetas y luego archivos con su ubicación, sin total', async () => {
      const body = bodyOf(await ana.search({ q: '  CAMIÓN  ' }));

      expect(body.items.map((item) => [item.type, item.id, item.location])).toEqual([
        ['folder', folderId, null],
        ['file', fileId, { id: folderId, name: FOLDER_NAME }],
      ]);
      expect(body.items[1]).toMatchObject({ kind: 'docx', updatedAt: MIDDLE });
      expect(body.nextCursor).toBeNull();
    });

    it('CA-7, CA-8: el tipo deja fuera las carpetas y el rango acota por fecha de modificación', async () => {
      const documents = bodyOf(await ana.search({ q: 'camion', type: 'documents' }));
      const images = bodyOf(await ana.search({ q: 'camion', type: 'images' }));
      const before = bodyOf(await ana.search({ q: 'camion', type: 'documents', to: MIDDLE }));
      const from = bodyOf(await ana.search({ q: 'camion', type: 'documents', from: MIDDLE }));

      expect(documents.items.map((item) => item.id)).toEqual([fileId]);
      expect(images.items).toEqual([]);
      expect(before.items).toEqual([]);
      expect(from.items.map((item) => item.id)).toEqual([fileId]);
    });

    it('CA-3: `limit` pagina con un cursor opaco que trae lo siguiente', async () => {
      const first = bodyOf(await ana.search({ q: 'camion', limit: '1' }));
      const second = bodyOf(
        await ana.search({ q: 'camion', limit: '1', cursor: first.nextCursor ?? '' }),
      );

      expect(first.items.map((item) => item.id)).toEqual([folderId]);
      expect(second.items.map((item) => item.id)).toEqual([fileId]);
      expect(second.nextCursor).toBeNull();
    });
  });

  describe('consultas inválidas', () => {
    it.each([
      [{}, 'q', 'REQUIRED'],
      [{ q: '   ' }, 'q', 'REQUIRED'],
      [{ q: 'a'.repeat(256) }, 'q', 'NAME_TOO_LONG'],
      [{ q: 'a', type: 'docx' }, 'type', 'INVALID_TYPE'],
      [{ q: 'a', from: 'ayer' }, 'from', 'INVALID_DATE'],
      [{ q: 'a', from: MIDDLE, to: MIDDLE }, 'to', 'INVALID_RANGE'],
      [{ q: 'a', cursor: 'basura' }, 'cursor', 'INVALID_CURSOR'],
    ])(
      'CA-6, CA-9: %j responde `400 STORAGE_INVALID_QUERY` con el campo',
      async (query, field, reason) => {
        expectQueryError(await ana.search(query), field, reason);
      },
    );

    it('CA-6: los mensajes de `q` son los de la búsqueda', async () => {
      const body = (await ana.search({ q: '' })).body as ErrorBody;

      expect(body.fields?.[0]?.message).toBe(STORAGE_SEARCH_FIELD_MESSAGES.REQUIRED);
    });
  });

  describe('roles', () => {
    it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
      'CA-14: el rol interno %s recibe 403 SHARED_FORBIDDEN',
      async (role) => {
        const internal = await storage.newClient(role);

        const response = await internal.search({ q: 'camion' });

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ code: 'SHARED_FORBIDDEN' });
      },
    );

    it('CA-14: sin token responde 401 SHARED_UNAUTHENTICATED', async () => {
      const response = await storage.clientFor(ana.id).search({ q: 'camion' });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'SHARED_UNAUTHENTICATED' });
    });
  });

  describe('bitácoras (CA-15)', () => {
    it('CA-15: con resultados, sin ellos y con error, ninguna línea lleva el texto, la consulta ni nombres; no se audita', async () => {
      storage.testApp.logs.clear();

      expect((await ana.search({ q: TYPED_TEXT })).status).toBe(200);
      expect((await ana.search({ q: 'Camiones-reservado' })).status).toBe(200);
      expect((await ana.search({ q: TYPED_TEXT, from: 'ayer' })).status).toBe(400);

      const lines = storage.testApp.logs.lines();
      const dump = JSON.stringify(lines);
      expect(lines.length).toBeGreaterThan(0);
      for (const forbidden of [
        TYPED_TEXT,
        'informe-zz71',
        'Camiones-reservado',
        FOLDER_NAME,
        FILE_NAME,
        '?q=',
      ]) {
        expect(dump).not.toContain(forbidden);
      }
      expect(lines.filter((line) => line.event === 'audit.record')).toEqual([]);
    });
  });
});
