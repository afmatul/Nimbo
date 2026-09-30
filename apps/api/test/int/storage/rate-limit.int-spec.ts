import { randomUUID } from 'node:crypto';

import { countRows, createStorageHttpApp } from './storage-http';
import type { StorageHttpApp } from './storage-http';

/** Límites bajos para la prueba (RN-16: las cifras son configuración, no código). */
const INIT_PER_MINUTE = 2;
const DOWNLOAD_PER_MINUTE = 2;
const WINDOW_SECONDS = 60;
const TOO_MANY_MESSAGE = 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.';

/**
 * Límite de tasa con Redis real (CA-19): inicio de carga y emisión de URL de descarga, por actor, con `Retry-After`.
 * En la descarga, la tasa corre antes de resolver el archivo: un id inexistente también consume.
 */
describe('límite de tasa de storage con Redis real (CA-19)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp({
      env: {
        RATE_LIMIT_UPLOAD_INIT_PER_MINUTE: String(INIT_PER_MINUTE),
        RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE: String(DOWNLOAD_PER_MINUTE),
      },
    });
  });

  afterAll(async () => {
    await storage?.close();
  });

  const expectTooMany = (response: {
    status: number;
    body: unknown;
    headers: Record<string, string>;
  }) => {
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      code: 'STORAGE_TOO_MANY_REQUESTS',
      message: TOO_MANY_MESSAGE,
    });
    const retryAfter = Number(response.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(WINDOW_SECONDS);
  };

  it('CA-19: el inicio de carga por encima del límite es 429 con `Retry-After` y no reserva', async () => {
    const client = await storage.newClient();
    for (let attempt = 1; attempt <= INIT_PER_MINUTE; attempt += 1) {
      expect((await client.init({ name: `n${String(attempt)}.txt`, sizeBytes: 10 })).status).toBe(
        201,
      );
    }

    const response = await client.init({ name: 'de-mas.txt', sizeBytes: 10 });

    expectTooMany(response);
    expect(await countRows(storage.owner, 'carga', client.id)).toBe(INIT_PER_MINUTE);
  });

  it('CA-19: la emisión de URL de descarga por encima del límite es 429, aunque el archivo no exista', async () => {
    const client = await storage.newClient();
    for (let attempt = 1; attempt <= DOWNLOAD_PER_MINUTE; attempt += 1) {
      expect((await client.downloadUrl(randomUUID())).status).toBe(404);
    }

    expectTooMany(await client.downloadUrl(randomUUID()));
  });

  it('CA-19: el límite es por actor: otro cliente no queda limitado', async () => {
    const limited = await storage.newClient();
    const other = await storage.newClient();
    for (let attempt = 0; attempt <= INIT_PER_MINUTE; attempt += 1) {
      await limited.init({ name: `x${String(attempt)}.txt`, sizeBytes: 10 });
    }

    expect((await other.init({ name: 'libre.txt', sizeBytes: 10 })).status).toBe(201);
  });

  it('CA-19: el 429 deja la bitácora `upload.rate_limited` con la operación y sin el nombre', async () => {
    const client = await storage.newClient();
    storage.testApp.logs.clear();
    for (let attempt = 0; attempt <= INIT_PER_MINUTE; attempt += 1) {
      await client.init({ name: 'secreto-limitado.txt', sizeBytes: 10 });
    }

    const lines = storage.testApp.logs.lines();

    expect(lines).toContainEqual(
      expect.objectContaining({ event: 'upload.rate_limited', operation: 'upload_init' }),
    );
    expect(JSON.stringify(lines)).not.toContain('secreto-limitado');
  });
});
