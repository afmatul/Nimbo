import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { optimizationResponseSchema, optimizationStatusSchema } from '@nimbo/contracts';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { Response } from 'supertest';

import { OptimizerModule } from '../../../src/modules/optimizer';
import { createStorageHttpApp } from '../storage/storage-http';
import type { StorageClient, StorageHttpApp } from '../storage/storage-http';

const API_PREFIX = '/api/v1';
/** Tope de bytes de la suite: las imágenes «normales» quedan debajo y `BIG_BYTES` arriba (CA-5). */
const MAX_FILE_BYTES = 6000;
const IMAGE_BYTES = 4096;
const BIG_BYTES = 8192;
const SIGNATURES = {
  jpg: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  gif: Buffer.from('GIF89a', 'latin1'),
  webp: Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.alloc(4),
    Buffer.from('WEBP', 'latin1'),
  ]),
  pdf: Buffer.from('%PDF-1.7\n', 'latin1'),
} as const;
type Extension = keyof typeof SIGNATURES;

const bytesOf = (extension: Extension, size: number): Buffer => {
  const signature = SIGNATURES[extension];
  return Buffer.concat([signature, Buffer.alloc(size - signature.length, 7)]);
};

/**
 * Pedir el cálculo de ahorro y consultar su estado por HTTP (021 T-02; CA-3 a CA-5, CA-17 a CA-19) con Postgres como
 * `nimbo_app` (RLS), Redis real para la tasa y la cola, y MinIO real. Sin `worker` en esta suite: lo pedido queda
 * `estimando` (el cálculo lo prueba `estimate-worker`); los trabajos encolados se borran al terminar.
 */
describe('calcular el ahorro y consultar el estado (021 T-02)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp({
      env: { OPTIMIZER_MAX_FILE_BYTES: String(MAX_FILE_BYTES) },
      withStorage: (storageModule, env) => [
        OptimizerModule.forRoot(env, { storage: storageModule }),
      ],
    });
  });

  afterAll(async () => {
    await storage?.testApp.app
      .get<Queue>(getQueueToken('optimization'))
      .obliterate({ force: true });
    await storage?.close();
  });

  const http = () => request(storage.testApp.app.getHttpServer());
  const auth = (client: StorageClient) => ({
    Authorization: `Bearer ${storage.tokenOf(client.id) ?? ''}`,
  });
  const estimate = (client: StorageClient, fileId: string): Promise<Response> =>
    http().post(`${API_PREFIX}/files/${fileId}/optimization/estimate`).set(auth(client));
  const status = (client: StorageClient, fileId: string): Promise<Response> =>
    http().get(`${API_PREFIX}/files/${fileId}/optimization`).set(auth(client));

  const upload = async (
    client: StorageClient,
    extension: Extension,
    size = IMAGE_BYTES,
  ): Promise<string> => {
    const uploaded = await client.upload(`${randomUUID()}.${extension}`, bytesOf(extension, size));
    expect(uploaded.status).toBe(200);
    return (uploaded.body as { file: { id: string } }).file.id;
  };

  const rowsOf = (fileId: string): Promise<{ estado: string }[]> =>
    storage.owner.query('SELECT estado FROM optimizacion WHERE archivo_id = $1', [fileId]);

  const withoutCorrelation = (body: unknown): unknown => {
    const { correlationId: _ignored, ...rest } = body as Record<string, unknown>;
    return rest;
  };

  it.each<[Extension]>([['jpg'], ['png']])(
    'CA-1: un %s propio y vivo queda `estimando` y el estado lo devuelve con `pollAfterMs`',
    async (extension) => {
      const ana = await storage.newClient();
      const fileId = await upload(ana, extension);

      const requested = await estimate(ana, fileId);

      expect(requested.status).toBe(202);
      const body = optimizationStatusSchema.parse(requested.body);
      expect(body).toMatchObject({
        state: 'estimando',
        originalBytes: IMAGE_BYTES,
        pollAfterMs: 3000,
      });
      const read = await status(ana, fileId);
      expect(read.status).toBe(200);
      expect(optimizationResponseSchema.parse(read.body).optimization?.id).toBe(body.id);
    },
  );

  it('sin pedidos, el estado es `{ optimization: null }`', async () => {
    const ana = await storage.newClient();
    const fileId = await upload(ana, 'png');

    const read = await status(ana, fileId);

    expect(read.status).toBe(200);
    expect(read.body).toEqual({ optimization: null });
  });

  it.each<[Extension]>([['gif'], ['webp'], ['pdf']])(
    'CA-3: un %s es `422 OPTIMIZER_UNSUPPORTED_TYPE` y no crea nada',
    async (extension) => {
      const ana = await storage.newClient();
      const fileId = await upload(ana, extension);

      const requested = await estimate(ana, fileId);

      expect(requested.status).toBe(422);
      expect(requested.body).toMatchObject({ code: 'OPTIMIZER_UNSUPPORTED_TYPE' });
      expect(await rowsOf(fileId)).toEqual([]);
    },
  );

  it('CA-4: un `.png` cuyo contenido real es un JPEG es `422` y no crea nada', async () => {
    const ana = await storage.newClient();
    const fileId = await upload(ana, 'png');
    const [current] = (await storage.owner.query(
      `SELECT v.clave_objeto FROM version_archivo v JOIN archivo a ON a.version_actual_id = v.id WHERE a.id = $1`,
      [fileId],
    )) as { clave_objeto: string }[];
    await storage.putObject(current?.clave_objeto ?? '', bytesOf('jpg', IMAGE_BYTES));

    const requested = await estimate(ana, fileId);

    expect(requested.status).toBe(422);
    expect(requested.body).toMatchObject({ code: 'OPTIMIZER_UNSUPPORTED_TYPE' });
    expect(await rowsOf(fileId)).toEqual([]);
  });

  it('CA-5: por encima del tope de bytes queda `no_disponible(tamano)`, sin `pollAfterMs`', async () => {
    const ana = await storage.newClient();
    const fileId = await upload(ana, 'jpg', BIG_BYTES);

    const requested = await estimate(ana, fileId);

    expect(requested.status).toBe(202);
    expect(optimizationStatusSchema.parse(requested.body)).toMatchObject({
      state: 'no_disponible',
      reason: 'tamano',
      pollAfterMs: null,
    });
  });

  it('CA-17: con la cuenta en solo lectura, calcular se permite', async () => {
    const ana = await storage.newClient();
    const fileId = await upload(ana, 'jpg');
    storage.limits.setReadOnly(true);
    try {
      const requested = await estimate(ana, fileId);

      expect(requested.status).toBe(202);
      expect(requested.body).toMatchObject({ state: 'estimando' });
    } finally {
      storage.limits.setReadOnly(false);
    }
  });

  it('RN-9: pedir otra vez mientras está en curso devuelve la misma, sin otra fila', async () => {
    const ana = await storage.newClient();
    const fileId = await upload(ana, 'png');
    const first = await estimate(ana, fileId);

    const again = await estimate(ana, fileId);

    expect((again.body as { id: string }).id).toBe((first.body as { id: string }).id);
    expect(await rowsOf(fileId)).toHaveLength(1);
  });

  it('caducidad perezosa: una en curso perdida se ve `fallida(servicio_no_disponible)` y se puede pedir otra', async () => {
    const ana = await storage.newClient();
    const fileId = await upload(ana, 'png');
    const first = await estimate(ana, fileId);
    await storage.owner.query(
      "UPDATE optimizacion SET actualizado_en = now() - interval '2 hours' WHERE id = $1",
      [(first.body as { id: string }).id],
    );

    const read = await status(ana, fileId);
    const again = await estimate(ana, fileId);

    expect(optimizationResponseSchema.parse(read.body).optimization).toMatchObject({
      state: 'fallida',
      reason: 'servicio_no_disponible',
      pollAfterMs: null,
    });
    expect(again.body).toMatchObject({ state: 'estimando' });
    expect((again.body as { id: string }).id).not.toBe((first.body as { id: string }).id);
  });

  it('CA-18: en la papelera, calcular y consultar son `404` de nodo', async () => {
    const ana = await storage.newClient();
    const fileId = await upload(ana, 'jpg');
    expect((await ana.trashFile(fileId)).status).toBe(200);

    for (const response of [await estimate(ana, fileId), await status(ana, fileId)]) {
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
    }
  });

  it('CA-19: B no calcula ni consulta la imagen de A: el mismo `404` que un archivo inexistente', async () => {
    const ana = await storage.newClient();
    const bruno = await storage.newClient();
    const fileId = await upload(ana, 'jpg');
    await estimate(ana, fileId);

    const foreign = [await estimate(bruno, fileId), await status(bruno, fileId)];
    const missing = await estimate(bruno, randomUUID());

    for (const response of foreign) {
      expect(response.status).toBe(404);
      expect(withoutCorrelation(response.body)).toEqual(withoutCorrelation(missing.body));
    }
    expect(await rowsOf(fileId)).toHaveLength(1);
  });

  it('un `:fileId` que no es UUID es el mismo `404` de nodo', async () => {
    const ana = await storage.newClient();

    const response = await estimate(ana, 'no-es-un-uuid');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
  });

  it('RNF-07: pasado el límite por minuto, calcular es `429 SHARED_TOO_MANY_REQUESTS`', async () => {
    const ana = await storage.newClient();
    const responses: Response[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(await estimate(ana, randomUUID()));
    }

    expect(responses.slice(0, 10).every((response) => response.status === 404)).toBe(true);
    expect(responses[10]?.status).toBe(429);
    expect(responses[10]?.body).toMatchObject({ code: 'SHARED_TOO_MANY_REQUESTS' });
  });
});
