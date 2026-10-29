import { randomUUID } from 'node:crypto';

import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getQueueToken } from '@nestjs/bullmq';
import { optimizationResponseSchema, optimizationStatusSchema } from '@nimbo/contracts';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { Response } from 'supertest';

import { OptimizerModule } from '../../../src/modules/optimizer';
import { I_OPTIMIZER } from '../../../src/modules/optimizer/application/ports/i-optimizer.port';
import type { IOptimizer } from '../../../src/modules/optimizer/application/ports/i-optimizer.port';
import { OptimizerWorkerModule } from '../../../src/modules/optimizer/worker';
import { StorageFacadesWorkerModule } from '../../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import {
  animatedPng,
  jpeg,
  jpegWithOrientationAndP3,
  noisyPng,
  pngWithAlpha,
  truncatedJpeg,
} from '../../support/image-fixtures';
import { buildOptimizerTestEnv } from '../../support/optimizer-env';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { createStorageHttpApp, STORAGE_HTTP_BUCKET } from '../storage/storage-http';
import type { StorageClient, StorageHttpApp } from '../storage/storage-http';

const API_PREFIX = '/api/v1';
const OPTIMIZATION_QUEUE = 'optimization';
/** Un solo intento: el fallo técnico se da por vencido enseguida (CA-14). */
const MAX_ATTEMPTS = '1';
/** Topes chicos para *fixtures* chicos: 50 000 píxeles y 100 bytes de ahorro mínimo (el 20 % se mantiene). */
const WORKER_ENV = {
  MINIO_BUCKET: STORAGE_HTTP_BUCKET,
  OPTIMIZER_MAX_PIXELS: '50000',
  OPTIMIZER_MIN_SAVED_BYTES: '100',
};
const WAIT_STEP_MS = 100;
const WAIT_MS = 30_000;

interface OptimizationRow {
  readonly id: string;
  readonly estado: string;
  readonly motivo: string | null;
  readonly bytes_origen: string;
  readonly bytes_estimados: string | null;
}

const createWorker = (): Promise<TestApp> => {
  const env = buildOptimizerTestEnv(WORKER_ENV);
  const storage = StorageFacadesWorkerModule.forRoot();
  return createTestApp({
    validatedEnv: env,
    // Sin estrategia de tokens propia: el `worker` no atiende HTTP (como el mundo de 019).
    accessTokenStrategy: 'identity',
    modules: [PlanLimitsBindingModule, storage, OptimizerWorkerModule.forRoot(env, storage)],
    prefix: '',
  });
};

/**
 * Calcular el ahorro de punta a punta (021 T-03; CA-1, CA-2, CA-5, CA-14): el `api` (`OptimizerModule`) crea la fila y
 * encola en `optimization`; el `worker` (`OptimizerWorkerModule`, con `sharp` real) la reclama, lee la versión de MinIO,
 * inspecciona, recomprime en memoria y deja el resultado. Postgres como `nimbo_app` (RLS), Redis y MinIO reales.
 */
describe('el `worker` calcula el ahorro (021 T-03)', () => {
  let storage: StorageHttpApp;
  let worker: TestApp;
  let queue: Queue;

  beforeAll(async () => {
    storage = await createStorageHttpApp({
      env: { OPTIMIZER_MAX_ATTEMPTS: MAX_ATTEMPTS },
      withStorage: (storageModule, env) => [
        OptimizerModule.forRoot(env, { storage: storageModule }),
      ],
    });
    worker = await createWorker();
    queue = worker.app.get<Queue>(getQueueToken(OPTIMIZATION_QUEUE));
  });

  afterAll(async () => {
    await queue?.obliterate({ force: true });
    await worker?.close();
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

  const upload = async (client: StorageClient, name: string, bytes: Buffer): Promise<string> => {
    const uploaded = await client.upload(`${randomUUID()}-${name}`, bytes);
    expect(uploaded.status).toBe(200);
    return (uploaded.body as { file: { id: string } }).file.id;
  };

  const rowsOf = (fileId: string): Promise<OptimizationRow[]> =>
    storage.owner.query(
      'SELECT id, estado, motivo, bytes_origen, bytes_estimados FROM optimizacion WHERE archivo_id = $1',
      [fileId],
    );

  /** Espera a que la única optimización del archivo salga de `estimando`. */
  const settled = async (fileId: string): Promise<OptimizationRow> => {
    const deadline = Date.now() + WAIT_MS;
    for (;;) {
      const [row] = await rowsOf(fileId);
      if (row !== undefined && row.estado !== 'estimando') return row;
      if (Date.now() >= deadline) throw new Error(`Sin resultado en ${String(WAIT_MS)} ms`);
      await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
    }
  };

  const requestAndSettle = async (name: string, bytes: Buffer) => {
    const ana = await storage.newClient();
    const fileId = await upload(ana, name, bytes);
    const requested = await estimate(ana, fileId);
    expect(requested.status).toBe(202);
    expect(optimizationStatusSchema.parse(requested.body).state).toBe('estimando');
    return { ana, fileId, row: await settled(fileId) };
  };

  it('CA-1: un JPEG con orientación 6 y perfil P3 queda `estimada` con los bytes estimados, sin cambiar el archivo', async () => {
    const original = await jpegWithOrientationAndP3(200, 150);
    const { ana, fileId, row } = await requestAndSettle('foto.jpg', original);

    expect(row).toMatchObject({ estado: 'estimada', motivo: null });
    expect(BigInt(row.bytes_estimados ?? '0')).toBeLessThan(BigInt(original.length));
    const read = optimizationResponseSchema.parse((await status(ana, fileId)).body);
    expect(read.optimization).toMatchObject({
      id: row.id,
      state: 'estimada',
      originalBytes: original.length,
      estimatedBytes: Number(row.bytes_estimados),
      pollAfterMs: null,
    });
    expect(read.optimization?.savedPercent).toBeGreaterThanOrEqual(20);
    const versions = (await storage.owner.query(
      'SELECT count(*)::int AS total FROM version_archivo WHERE archivo_id = $1',
      [fileId],
    )) as { total: number }[];
    expect(versions[0]?.total).toBe(1);
  });

  it('CA-1: un PNG sin comprimir con alfa queda `estimada`', async () => {
    const { row } = await requestAndSettle('logo.png', await pngWithAlpha(200, 150));

    expect(row).toMatchObject({ estado: 'estimada', motivo: null });
  });

  it('plan §6: un candidato PNG con dimensiones distintas nunca se ofrece, aunque ahorre bytes', async () => {
    const optimizer = worker.app.get<IOptimizer>(I_OPTIMIZER);
    const optimize = jest
      .spyOn(optimizer, 'optimize')
      .mockResolvedValueOnce(await pngWithAlpha(10, 10));
    try {
      const { ana, fileId, row } = await requestAndSettle(
        'invalida.png',
        await pngWithAlpha(200, 150),
      );

      expect(row).toMatchObject({ estado: 'fallida', motivo: 'integridad', bytes_estimados: null });
      const read = optimizationResponseSchema.parse((await status(ana, fileId)).body);
      expect(read.optimization).toMatchObject({
        state: 'fallida',
        reason: 'integridad',
        pollAfterMs: null,
      });
      const [versions] = (await storage.owner.query(
        'SELECT count(*)::int AS total FROM version_archivo WHERE archivo_id = $1',
        [fileId],
      )) as { total: number }[];
      expect(versions?.total).toBe(1);
    } finally {
      optimize.mockRestore();
    }
  });

  it('CA-2: un PNG que ya está comprimido al máximo queda `no_conviene` con sus bytes', async () => {
    const { ana, fileId, row } = await requestAndSettle('ruido.png', await noisyPng());

    expect(row).toMatchObject({ estado: 'no_conviene', motivo: null });
    expect(row.bytes_estimados).not.toBeNull();
    const read = optimizationResponseSchema.parse((await status(ana, fileId)).body);
    expect(read.optimization).toMatchObject({ state: 'no_conviene', keepOriginalDays: null });
  });

  it.each([
    ['pixeles', 'más píxeles que el tope', 'grande.jpg', () => jpeg(300, 200)],
    ['animada', 'un PNG animado', 'animado.png', animatedPng],
    ['ilegible', 'un JPEG truncado', 'roto.jpg', truncatedJpeg],
  ])(
    'CA-5: `no_disponible(%s)` con %s, sin bytes estimados',
    async (reason, _case, name, fixture) => {
      const { ana, fileId, row } = await requestAndSettle(name, await fixture());

      expect(row).toMatchObject({ estado: 'no_disponible', motivo: reason, bytes_estimados: null });
      const read = optimizationResponseSchema.parse((await status(ana, fileId)).body);
      expect(read.optimization).toMatchObject({ state: 'no_disponible', reason });
    },
  );

  it('CA-14: si el objeto no se puede leer y se agotan los intentos, queda `fallida(servicio_no_disponible)`', async () => {
    const ana = await storage.newClient();
    const fileId = await upload(ana, 'perdida.png', await pngWithAlpha());
    const [current] = (await storage.owner.query(
      'SELECT v.clave_objeto FROM version_archivo v JOIN archivo a ON a.version_actual_id = v.id WHERE a.id = $1',
      [fileId],
    )) as { clave_objeto: string }[];
    // El pedido lee el objeto (tipo real); se borra después, con la cola en pausa, antes de que el `worker` lo lea.
    await queue.pause();
    expect((await estimate(ana, fileId)).status).toBe(202);
    await storage.s3.send(
      new DeleteObjectCommand({ Bucket: STORAGE_HTTP_BUCKET, Key: current?.clave_objeto }),
    );
    await queue.resume();

    expect(await settled(fileId)).toMatchObject({
      estado: 'fallida',
      motivo: 'servicio_no_disponible',
    });
  });

  it('repetir el pedido después del cálculo devuelve la misma estimación, sin otra fila ni otro trabajo', async () => {
    const { ana, fileId, row } = await requestAndSettle('repetida.png', await pngWithAlpha());

    const again = await estimate(ana, fileId);

    expect(optimizationStatusSchema.parse(again.body)).toMatchObject({
      id: row.id,
      state: 'estimada',
    });
    expect(await rowsOf(fileId)).toHaveLength(1);
    expect(await queue.getJob(`estimate-${row.id}`)).toBeUndefined();
  });

  it('CA-21: las bitácoras del cálculo no llevan nombres de archivo ni mensajes de `sharp`', async () => {
    const name = `${randomUUID()}-secreto.jpg`;
    const ana = await storage.newClient();
    const fileId = await upload(ana, name, await truncatedJpeg());
    await estimate(ana, fileId);
    await settled(fileId);

    const logged = JSON.stringify(worker.logs.lines());
    expect(logged).toContain('optimization.unavailable');
    expect(logged).not.toContain('secreto');
    expect(logged).not.toContain('premature end');
  });
});
