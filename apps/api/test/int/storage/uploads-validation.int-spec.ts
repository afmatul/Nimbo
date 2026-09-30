import { initUploadResponseSchema } from '@nimbo/contracts';

import {
  countRows,
  createStorageHttpApp,
  DEFAULT_TEST_LIMITS,
  textBytes,
  uploadRow,
  usedBytesOf,
} from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const DECLARED_BYTES = 64;

/**
 * Entrada inválida (400 con `fields`), archivo vacío (422) y tamaño real distinto del declarado al completar, por
 * HTTP y con el estado real de Postgres y MinIO (CA-5, CA-7).
 */
describe('validación de cargas por HTTP (CA-5, CA-7)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  beforeEach(() => {
    storage.limits.setLimits(DEFAULT_TEST_LIMITS);
  });

  afterAll(async () => {
    await storage?.close();
  });

  /** Inicia una carga simple y devuelve su id y la clave de su objeto (leída como el dueño; la API no la expone). */
  const startSimple = async (
    client: StorageClient,
    name: string,
  ): Promise<{ uploadId: string; key: string }> => {
    const started = await client.init({ name, sizeBytes: DECLARED_BYTES });
    const { uploadId } = initUploadResponseSchema.parse(started.body);
    return { uploadId, key: (await uploadRow(storage.owner, uploadId)).clave_objeto };
  };

  describe('POST /uploads con entrada inválida (CA-7)', () => {
    it.each([
      ['nombre vacío', { name: '   ', sizeBytes: 10 }, 'name', 'REQUIRED'],
      ['nombre con «/»', { name: 'a/b.txt', sizeBytes: 10 }, 'name', 'INVALID_NAME'],
      ['nombre con «\\»', { name: 'a\\b.txt', sizeBytes: 10 }, 'name', 'INVALID_NAME'],
      ['nombre «..»', { name: '..', sizeBytes: 10 }, 'name', 'INVALID_NAME'],
      [
        'nombre de 256 caracteres',
        { name: `${'a'.repeat(252)}.txt`, sizeBytes: 10 },
        'name',
        'NAME_TOO_LONG',
      ],
      ['tamaño negativo', { name: 'a.txt', sizeBytes: -1 }, 'sizeBytes', 'INVALID_SIZE'],
      ['tamaño no entero', { name: 'a.txt', sizeBytes: 1.5 }, 'sizeBytes', 'INVALID_SIZE'],
      ['tamaño como texto', { name: 'a.txt', sizeBytes: '10' }, 'sizeBytes', 'INVALID_SIZE'],
      ['sin tamaño', { name: 'a.txt' }, 'sizeBytes', 'REQUIRED'],
      ['sin nombre', { sizeBytes: 10 }, 'name', 'REQUIRED'],
    ])(
      'CA-7: %s es 400 con el campo en falla y no crea nada',
      async (_case, body, field, reason) => {
        const client = await storage.newClient();

        const response = await client.init(body);

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          code: 'STORAGE_INVALID_UPLOAD_REQUEST',
          fields: [expect.objectContaining({ field, reason })],
        });
        expect(await countRows(storage.owner, 'carga', client.id)).toBe(0);
      },
    );

    it('CA-7: un campo desconocido es 400 `UNKNOWN_FIELD`', async () => {
      const client = await storage.newClient();

      const response = await client.init({ name: 'a.txt', sizeBytes: 10, replace: true });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'STORAGE_INVALID_UPLOAD_REQUEST',
        fields: [expect.objectContaining({ reason: 'UNKNOWN_FIELD' })],
      });
    });

    it('CA-7: tamaño 0 es 422 `STORAGE_EMPTY_FILE` y no crea nada', async () => {
      const client = await storage.newClient();

      const response = await client.init({ name: 'vacio.txt', sizeBytes: 0 });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        code: 'STORAGE_EMPTY_FILE',
        message: 'El archivo está vacío. Revisa que tenga contenido y súbelo de nuevo.',
      });
      expect(await countRows(storage.owner, 'carga', client.id)).toBe(0);
    });

    it('CA-7: un cursor que la API no emitió es 400 `STORAGE_INVALID_QUERY`', async () => {
      const client = await storage.newClient();

      const response = await client.list({ cursor: 'no-es-un-cursor' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'STORAGE_INVALID_QUERY' });
    });
  });

  describe('POST /uploads/:id/complete con el objeto distinto de lo declarado (CA-5, CA-7)', () => {
    it('CA-5: más bytes que los declarados es 422 `STORAGE_UPLOAD_SIZE_MISMATCH`: objeto purgado, sin archivo ni espacio', async () => {
      const client = await storage.newClient();
      const { uploadId, key } = await startSimple(client, 'cambiado.txt');
      await storage.putObject(key, textBytes(DECLARED_BYTES + 1));

      const response = await client.complete(uploadId);

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        code: 'STORAGE_UPLOAD_SIZE_MISMATCH',
        message: 'El archivo cambió durante la carga. Vuelve a subirlo.',
      });
      expect(await uploadRow(storage.owner, uploadId)).toMatchObject({
        estado: 'rechazada',
        motivo_rechazo: 'tamano',
      });
      expect(await storage.versionsOf(key)).toBe(0);
      expect(await countRows(storage.owner, 'archivo', client.id)).toBe(0);
      expect(await usedBytesOf(storage.owner, client.id)).toBe(0n);
    });

    it('CA-5: más bytes que el máximo del plan es 422 `STORAGE_FILE_TOO_LARGE`', async () => {
      const client = await storage.newClient();
      const { uploadId, key } = await startSimple(client, 'crecio.txt');
      await storage.putObject(key, textBytes(DECLARED_BYTES + 1));
      storage.limits.setLimits({ ...DEFAULT_TEST_LIMITS, maxFileBytes: BigInt(DECLARED_BYTES) });

      const response = await client.complete(uploadId);

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'STORAGE_FILE_TOO_LARGE' });
      expect(await storage.versionsOf(key)).toBe(0);
    });

    it('CA-7: un objeto de 0 bytes es 422 `STORAGE_EMPTY_FILE` y la carga queda rechazada', async () => {
      const client = await storage.newClient();
      const { uploadId, key } = await startSimple(client, 'se-vacio.txt');
      await storage.putObject(key, Buffer.alloc(0));

      const response = await client.complete(uploadId);

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'STORAGE_EMPTY_FILE' });
      expect(await uploadRow(storage.owner, uploadId)).toMatchObject({
        estado: 'rechazada',
        motivo_rechazo: 'tamano',
      });
      expect(await countRows(storage.owner, 'archivo', client.id)).toBe(0);
    });

    it('CA-5: completar sin haber subido el objeto es 409 `STORAGE_UPLOAD_INCOMPLETE` y la carga sigue activa', async () => {
      const client = await storage.newClient();
      const { uploadId } = await startSimple(client, 'sin-subir.txt');

      const response = await client.complete(uploadId);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'STORAGE_UPLOAD_INCOMPLETE' });
      expect((await uploadRow(storage.owner, uploadId)).estado).toBe('activa');
    });
  });
});
