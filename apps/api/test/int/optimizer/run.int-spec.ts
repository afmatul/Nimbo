import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import {
  downloadUrlSchema,
  fileVersionSummarySchema,
  fileVersionsResponseSchema,
  optimizationResponseSchema,
  optimizationStatusSchema,
} from '@nimbo/contracts';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { Response } from 'supertest';

import { OptimizerModule } from '../../../src/modules/optimizer';
import { I_JOB_REPOSITORY } from '../../../src/modules/optimizer/application/ports/i-job.repository.port';
import type { IJobRepository } from '../../../src/modules/optimizer/application/ports/i-job.repository.port';
import { I_OPTIMIZER } from '../../../src/modules/optimizer/application/ports/i-optimizer.port';
import type { IOptimizer } from '../../../src/modules/optimizer/application/ports/i-optimizer.port';
import { OptimizationJob } from '../../../src/modules/optimizer/domain/optimization-job';
import { OptimizerWorkerModule } from '../../../src/modules/optimizer/worker';
import {
  I_OBJECT_STORAGE,
  I_PLAN_LIMITS_PROVIDER,
  OptimizableFileGateway,
  StorageFacadesWorkerModule,
} from '../../../src/modules/storage';
import type { IObjectStorage } from '../../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { createActor, I_TRANSACTION_RUNNER, Role } from '../../../src/shared';
import type { ITransactionRunner } from '../../../src/shared';
import { jpegWithOrientationAndP3, pngWithAlpha } from '../../support/image-fixtures';
import { buildOptimizerTestEnv } from '../../support/optimizer-env';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { registerVersion } from '../storage/register-version';
import {
  createStorageHttpApp,
  DEFAULT_TEST_LIMITS,
  STORAGE_HTTP_BUCKET,
  usedBytesOf,
} from '../storage/storage-http';
import type { StorageClient, StorageHttpApp } from '../storage/storage-http';

const PREFIX = '/api/v1';
const DAY_MS = 86_400_000;

interface OptimizationRow {
  id: string;
  estado: string;
  motivo: string | null;
  version_origen_id: string;
  version_resultado_id: string | null;
  bytes_resultado: string | null;
}

interface Prepared {
  client: StorageClient;
  fileId: string;
  optimizationId: string;
  original: Buffer;
}

interface VersionRow {
  id: string;
  origen: string;
  tamano_bytes: string;
  conservada_hasta: Date | null;
  creada_en: Date;
}

/** API + worker separados, con Postgres/RLS, BullMQ/Redis, MinIO versionado y sharp reales (021 T-04). */
describe('optimizar y registrar (021 T-04)', () => {
  let storage: StorageHttpApp;
  let worker: TestApp;
  let queue: Queue;

  beforeAll(async () => {
    storage = await createStorageHttpApp({
      withStorage: (module, env) => [OptimizerModule.forRoot(env, { storage: module })],
    });
    // Solo el mínimo de bytes baja para fixtures pequeños; porcentaje, calidad, intentos y tiempo son los aprobados.
    const env = buildOptimizerTestEnv({
      MINIO_BUCKET: STORAGE_HTTP_BUCKET,
      OPTIMIZER_MIN_SAVED_BYTES: '100',
    });
    const module = StorageFacadesWorkerModule.forRoot();
    worker = await createTestApp({
      validatedEnv: env,
      accessTokenStrategy: 'identity',
      prefix: '',
      modules: [PlanLimitsBindingModule, module, OptimizerWorkerModule.forRoot(env, module)],
      overrides: [{ provide: I_PLAN_LIMITS_PROVIDER, useValue: storage.limits }],
    });
    queue = worker.app.get<Queue>(getQueueToken('optimization'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    storage.limits.setLimits(DEFAULT_TEST_LIMITS);
    await queue.resume();
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
  const rowOf = async (fileId: string): Promise<OptimizationRow> => {
    const [row] = await storage.owner.query<OptimizationRow[]>(
      'SELECT * FROM optimizacion WHERE archivo_id = $1 ORDER BY creado_en DESC, id DESC LIMIT 1',
      [fileId],
    );
    if (row === undefined) throw new Error('Falta la optimización');
    return row;
  };
  const waitFor = async (fileId: string): Promise<OptimizationRow> => {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const row = await rowOf(fileId);
      if (!['estimando', 'optimizando'].includes(row.estado)) return row;
      if (Date.now() >= deadline) throw new Error('El trabajo no llegó a un estado final');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const versionsOf = (fileId: string): Promise<VersionRow[]> =>
    storage.owner.query(
      'SELECT id, origen, tamano_bytes, conservada_hasta, creada_en FROM version_archivo WHERE archivo_id = $1 ORDER BY numero',
      [fileId],
    );
  const currentOf = async (fileId: string): Promise<string> => {
    const [row] = await storage.owner.query<{ version_actual_id: string }[]>(
      'SELECT version_actual_id FROM archivo WHERE id = $1',
      [fileId],
    );
    return row?.version_actual_id ?? '';
  };
  const keyOf = (context: Prepared, versionId: string) =>
    `u/${context.client.id}/${context.fileId}/${versionId}`;
  const run = (context: Prepared, optimizationId = context.optimizationId): Promise<Response> =>
    http()
      .post(`${PREFIX}/files/${context.fileId}/optimization/run`)
      .set(auth(context.client))
      .send({ optimizationId });
  const prepare = async (extension: 'jpg' | 'png' = 'png'): Promise<Prepared> => {
    const client = await storage.newClient();
    const original =
      extension === 'jpg' ? await jpegWithOrientationAndP3(200, 150) : await pngWithAlpha(200, 150);
    const upload = await client.upload(`${randomUUID()}.${extension}`, original);
    expect(upload.status).toBe(200);
    const fileId = (upload.body as { file: { id: string } }).file.id;
    const response = await http()
      .post(`${PREFIX}/files/${fileId}/optimization/estimate`)
      .set(auth(client));
    expect(response.status).toBe(202);
    expect((await waitFor(fileId)).estado).toBe('estimada');
    return {
      client,
      fileId,
      optimizationId: optimizationStatusSchema.parse(response.body).id,
      original,
    };
  };
  const complete = async (context: Prepared): Promise<OptimizationRow> => {
    const response = await run(context);
    expect(response.status).toBe(202);
    expect(optimizationStatusSchema.parse(response.body).state).toBe('optimizando');
    const row = await waitFor(context.fileId);
    expect(row.estado).toBe('completada');
    return row;
  };

  const supersede = async (
    context: Prepared,
    change: 'restaurar' | 'reemplazar',
  ): Promise<string> => {
    const history = fileVersionsResponseSchema.parse(
      (await context.client.fileVersions(context.fileId)).body,
    );
    if (change === 'restaurar') {
      const response = await context.client.restoreVersion(
        context.fileId,
        history.items.find((version) => version.number === 1)?.id ?? '',
      );
      expect(response.status).toBe(201);
      return fileVersionSummarySchema.parse(response.body).id;
    }
    const response = await context.client.upload(history.file.name, context.original, 'replace');
    expect(response.status).toBe(200);
    expect((response.body as { file: { id: string } }).file.id).toBe(context.fileId);
    return currentOf(context.fileId);
  };

  const assertDownloads = async (context: Prepared, optimized: Buffer): Promise<void> => {
    const history = await context.client.fileVersions(context.fileId);
    expect(history.status).toBe(200);
    const { items } = fileVersionsResponseSchema.parse(history.body);
    expect(items.map((version) => version.number)).toEqual([3, 2, 1]);
    for (const version of items) {
      const issued = await context.client.versionDownloadUrl(context.fileId, version.id);
      expect(issued.status).toBe(200);
      const download = await fetch(downloadUrlSchema.parse(issued.body).url);
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer())).toEqual(
        version.number === 2 ? optimized : context.original,
      );
    }
  };

  const reestimateCurrent = async (context: Prepared, versionId: string): Promise<void> => {
    const requests = await Promise.all(
      [0, 1].map(() =>
        http()
          .post(`${PREFIX}/files/${context.fileId}/optimization/estimate`)
          .set(auth(context.client)),
      ),
    );
    expect(requests.map((response) => response.status)).toEqual([202, 202]);
    const ids = requests.map((response) => optimizationStatusSchema.parse(response.body).id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toBe(context.optimizationId);
    expect(await waitFor(context.fileId)).toMatchObject({
      id: ids[0],
      estado: 'estimada',
      version_origen_id: versionId,
    });
    expect((await run(context)).status).toBe(409);
  };

  const assertNoCurrentOptimization = async (context: Prepared): Promise<void> => {
    for (let read = 0; read < 2; read += 1) {
      const response = await http()
        .get(`${PREFIX}/files/${context.fileId}/optimization`)
        .set(auth(context.client));
      expect(response.status).toBe(200);
      expect(optimizationResponseSchema.parse(response.body).optimization).toBeNull();
    }
  };

  it.each(['restaurar', 'reemplazar'] as const)(
    'CA-1, CA-6, CA-15, CA-16: %s tras V1→V2 permite estimar V3 sin perder historial ni duplicar ahorro',
    async (change) => {
      const context = await prepare('jpg');
      const completed = await complete(context);
      const optimized = await storage.readObject(
        keyOf(context, completed.version_resultado_id ?? ''),
      );
      const previous = await versionsOf(context.fileId);
      const versionId = await supersede(context, change);
      const expectedUsed = BigInt(context.original.length + optimized.length);
      await assertNoCurrentOptimization(context);
      expect(await currentOf(context.fileId)).toBe(versionId);
      expect((await versionsOf(context.fileId)).slice(0, 2)).toEqual(previous);
      expect(await usedBytesOf(storage.owner, context.client.id)).toBe(expectedUsed);
      await assertDownloads(context, optimized);
      await reestimateCurrent(context, versionId);
      expect(await versionsOf(context.fileId)).toHaveLength(3);
      expect(await usedBytesOf(storage.owner, context.client.id)).toBe(expectedUsed);
      const [preserved] = await storage.owner.query<OptimizationRow[]>(
        'SELECT * FROM optimizacion WHERE id = $1',
        [completed.id],
      );
      expect(preserved).toEqual(completed);
    },
  );

  it.each(['jpg', 'png'] as const)(
    'CA-7, CA-8, CA-15: %s real queda current, original conservado y cuota Y-X',
    async (extension) => {
      const context = await prepare(extension);
      const before = await usedBytesOf(storage.owner, context.client.id);
      const completed = await complete(context);
      const [original, optimized] = await versionsOf(context.fileId);

      expect(optimized).toMatchObject({
        id: completed.version_resultado_id,
        origen: 'optimizacion',
        conservada_hasta: null,
      });
      expect(original?.conservada_hasta?.getTime()).toBe(
        (optimized?.creada_en.getTime() ?? 0) + DEFAULT_TEST_LIMITS.trashRetentionDays * DAY_MS,
      );
      expect(await currentOf(context.fileId)).toBe(optimized?.id);
      expect(BigInt(completed.bytes_resultado ?? '0')).toBeLessThan(
        BigInt(context.original.length),
      );
      expect(await usedBytesOf(storage.owner, context.client.id)).toBe(
        before - BigInt(context.original.length) + BigInt(completed.bytes_resultado ?? '0'),
      );
      expect(await versionsOf(context.fileId)).toHaveLength(2);
      expect(await storage.versionsOf(keyOf(context, completed.version_resultado_id ?? ''))).toBe(
        1,
      );
      const status = await http()
        .get(`${PREFIX}/files/${context.fileId}/optimization`)
        .set(auth(context.client));
      expect(optimizationResponseSchema.parse(status.body).optimization).toMatchObject({
        state: 'completada',
        pollAfterMs: null,
        keepOriginalDays: null,
      });
    },
  );

  it('CA-12: doble clic concurrente deja un trabajo run, un id de versión y un solo efecto en cuota', async () => {
    const context = await prepare();
    await queue.pause();
    const [first, second] = await Promise.all([run(context), run(context)]);
    expect([first.status, second.status]).toEqual([202, 202]);
    expect(first.body).toEqual(second.body);
    const row = await rowOf(context.fileId);
    expect((await queue.getJob(`run-${context.optimizationId}`))?.name).toBe('run');
    expect(await queue.count()).toBe(1);
    await queue.resume();
    const terminal = await waitFor(context.fileId);
    expect(terminal).toMatchObject({
      estado: 'completada',
      version_resultado_id: row.version_resultado_id,
    });
    expect(await versionsOf(context.fileId)).toHaveLength(2);
    expect(await usedBytesOf(storage.owner, context.client.id)).toBe(
      BigInt(terminal.bytes_resultado ?? '0'),
    );
    expect((await run(context)).status).toBe(409);
    expect(await versionsOf(context.fileId)).toHaveLength(2);
  });

  it('CA-17: solo lectura rechaza run con 403 sin cambiar la estimada', async () => {
    const context = await prepare();
    storage.limits.setReadOnly(true);
    const response = await run(context);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'STORAGE_ACCOUNT_READ_ONLY' });
    expect((await rowOf(context.fileId)).estado).toBe('estimada');
    expect(await versionsOf(context.fileId)).toHaveLength(1);
  });

  it('plan §5: una cuenta sobre cuota sí optimiza; no exige espacio libre', async () => {
    const context = await prepare();
    storage.limits.setLimits({ ...DEFAULT_TEST_LIMITS, storageQuotaBytes: 1n });
    const row = await complete(context);
    expect(await usedBytesOf(storage.owner, context.client.id)).toBe(
      BigInt(row.bytes_resultado ?? '0'),
    );
  });

  it('CA-11: una versión cambiada antes de confirmar es 409 stale', async () => {
    const context = await prepare();
    await registerVersion(storage, context.client, { fileId: context.fileId, sizeBytes: 4096 });
    // El tipo real sigue siendo una imagen para que este caso aísle la vigencia, no el 422 por contenido.
    const current = await currentOf(context.fileId);
    await storage.putObject(keyOf(context, current), context.original);
    const response = await run(context);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'OPTIMIZER_ESTIMATE_STALE' });
    expect((await rowOf(context.fileId)).estado).toBe('estimada');
  });

  it('CA-11 (carrera TOCTOU): una versión registrada entre leer el archivo y confirmar es 409, sin encolar ni optimizar', async () => {
    const context = await prepare();
    await queue.pause();
    const gateway = storage.testApp.app.get(OptimizableFileGateway);
    const read = gateway.findOwnedImage.bind(gateway);
    // `/run` ya leyó la versión A; antes de confirmar, otra petición registra la B (sigue siendo una imagen real).
    jest.spyOn(gateway, 'findOwnedImage').mockImplementationOnce(async (actor, fileId) => {
      const fileA = await read(actor, fileId);
      await registerVersion(storage, context.client, { fileId: context.fileId, sizeBytes: 4096 });
      await storage.putObject(keyOf(context, await currentOf(context.fileId)), context.original);
      return fileA;
    });

    const response = await run(context);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'OPTIMIZER_ESTIMATE_STALE' });
    expect((await rowOf(context.fileId)).estado).toBe('estimada');
    expect(await queue.getJob(`run-${context.optimizationId}`)).toBeUndefined();
    expect(await queue.count()).toBe(0);
    const versions = await versionsOf(context.fileId);
    expect(versions).toHaveLength(2);
    expect(versions.map((version) => version.origen)).not.toContain('optimizacion');
  });

  it('CA-14: un trabajo atascado más de `maxStalledCount` (BullMQ lo falla sin reintentar) queda fallida, no en curso', async () => {
    const client = await storage.newClient();
    const upload = await client.upload(`${randomUUID()}.png`, await pngWithAlpha(200, 150));
    const fileId = (upload.body as { file: { id: string } }).file.id;
    await queue.pause();
    const response = await http()
      .post(`${PREFIX}/files/${fileId}/optimization/estimate`)
      .set(auth(client));
    const { id } = optimizationStatusSchema.parse(response.body);
    // Lo que hace `moveStalledJobsToWait` al superar el límite: marca el fallo diferido y lo devuelve a `wait`.
    const redis = await queue.backend.client;
    await redis.hset(queue.toKey(`estimate-${id}`), {
      defa: 'job stalled more than allowable limit',
    });

    await queue.resume();

    const row = await waitFor(fileId);
    expect(row).toMatchObject({ estado: 'fallida', motivo: 'servicio_no_disponible' });
    expect(await queue.getJob(`estimate-${id}`)).toBeUndefined();
  });

  it('una estimación anterior ya sustituida no se confirma: 409', async () => {
    const context = await prepare();
    await storage.owner.query(
      "UPDATE optimizacion SET estado = 'fallida', motivo = 'integridad' WHERE id = $1",
      [context.optimizationId],
    );
    await http()
      .post(`${PREFIX}/files/${context.fileId}/optimization/estimate`)
      .set(auth(context.client));
    await waitFor(context.fileId);
    expect((await run(context)).status).toBe(409);
  });

  it('un optimizationId de otro archivo o inexistente es el mismo 409', async () => {
    const first = await prepare();
    const other = await prepare();
    for (const id of [other.optimizationId, randomUUID()]) {
      const response = await run(first, id);
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'OPTIMIZER_ESTIMATE_STALE' });
    }
  });

  it('archivo ajeno, inexistente o en papelera responde 404', async () => {
    const context = await prepare();
    const other = await storage.newClient();
    const contexts = [
      { ...context, client: other },
      { ...context, fileId: randomUUID() },
    ];
    await context.client.trashFile(context.fileId);
    contexts.push(context);
    for (const candidate of contexts) {
      const response = await run(candidate);
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
    }
  });

  it('CA-3: si el tipo real deja de ser válido responde 422', async () => {
    const context = await prepare();
    const row = await rowOf(context.fileId);
    await storage.putObject(keyOf(context, row.version_origen_id), Buffer.from('no es una imagen'));
    const response = await run(context);
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'OPTIMIZER_UNSUPPORTED_TYPE' });
  });

  it('RNF-07: run comparte las diez peticiones por minuto con estimate', async () => {
    const context = await prepare();
    for (let index = 0; index < 9; index += 1)
      expect((await run(context, randomUUID())).status).toBe(409);
    const response = await run(context);
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ code: 'SHARED_TOO_MANY_REQUESTS' });
  });

  it('contrato: un cuerpo sin un UUID confirmable se rechaza sin crear trabajo', async () => {
    const context = await prepare();
    const response = await http()
      .post(`${PREFIX}/files/${context.fileId}/optimization/run`)
      .set(auth(context.client))
      .send({ optimizationId: 'invalido' });
    expect(response.status).toBe(409);
    expect((await rowOf(context.fileId)).estado).toBe('estimada');
  });

  it.each(['version_cambiada', 'archivo_eliminado'] as const)(
    'CA-11: carrera real después del upload termina descartada(%s) y compensa',
    async (reason) => {
      const context = await prepare();
      const objects = worker.app.get<IObjectStorage>(I_OBJECT_STORAGE);
      const put = objects.putObjectStream.bind(objects);
      let replacement = '';
      jest.spyOn(objects, 'putObjectStream').mockImplementationOnce(async (key, content, size) => {
        await put(key, content, size);
        if (reason === 'archivo_eliminado') await context.client.trashFile(context.fileId);
        else
          replacement = (
            await registerVersion(storage, context.client, {
              fileId: context.fileId,
              sizeBytes: 4096,
            })
          ).id;
      });
      expect((await run(context)).status).toBe(202);
      const row = await waitFor(context.fileId);
      expect(row).toMatchObject({ estado: 'descartada', motivo: reason });
      expect(await storage.versionsOf(keyOf(context, row.version_resultado_id ?? ''))).toBe(0);
      expect(await versionsOf(context.fileId)).toHaveLength(reason === 'archivo_eliminado' ? 1 : 2);
      if (replacement !== '') expect(await currentOf(context.fileId)).toBe(replacement);
    },
  );

  it('CA-12: caída tras registrar y antes de completada reintenta y converge por duplicate', async () => {
    const context = await prepare();
    const repository = worker.app.get<IJobRepository>(I_JOB_REPOSITORY);
    const originalCas = repository.compareAndSet.bind(repository);
    let failOnce = true;
    jest.spyOn(repository, 'compareAndSet').mockImplementation(async (actor, next, previous) => {
      if (next.state === 'completada' && failOnce) {
        failOnce = false;
        throw new Error('BD temporal');
      }
      return originalCas(actor, next, previous);
    });
    const optimizer = worker.app.get<IOptimizer>(I_OPTIMIZER);
    const optimize = jest.spyOn(optimizer, 'optimize');
    const gateway = worker.app.get(OptimizableFileGateway);
    const recover = jest.spyOn(gateway, 'findRegisteredOptimization');
    const row = await complete(context);
    expect(recover.mock.results.some((result) => result.type === 'return')).toBe(true);
    expect(optimize).toHaveBeenCalledTimes(1);
    expect(await versionsOf(context.fileId)).toHaveLength(2);
    expect(await storage.versionsOf(keyOf(context, row.version_resultado_id ?? ''))).toBe(1);
    expect(await usedBytesOf(storage.owner, context.client.id)).toBe(
      BigInt(row.bytes_resultado ?? '0'),
    );
    expect(
      await gateway.findRegisteredOptimization(createActor(context.client.id, Role.CLIENT), {
        fileId: context.fileId,
        versionId: row.version_resultado_id ?? '',
      }),
    ).toMatchObject({ status: 'duplicate', sizeBytes: BigInt(row.bytes_resultado ?? '0') });
  });

  it('CA-16: restaurar el original usa 014b, vuelve a contar y exige cuota', async () => {
    const context = await prepare();
    const row = await complete(context);
    const [original] = await versionsOf(context.fileId);
    const before = await usedBytesOf(storage.owner, context.client.id);
    storage.limits.setLimits({
      ...DEFAULT_TEST_LIMITS,
      storageQuotaBytes: before + BigInt(context.original.length) - 1n,
    });
    const rejected = await context.client.restoreVersion(context.fileId, original?.id ?? '');
    expect(rejected.status).toBe(422);
    expect(rejected.body).toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });
    expect(await currentOf(context.fileId)).toBe(row.version_resultado_id);
    expect(await usedBytesOf(storage.owner, context.client.id)).toBe(before);
    storage.limits.setLimits(DEFAULT_TEST_LIMITS);
    const restored = await context.client.restoreVersion(context.fileId, original?.id ?? '');
    expect(restored.status).toBe(201);
    expect(fileVersionSummarySchema.parse(restored.body)).toMatchObject({
      origin: 'restauracion',
      sizeBytes: context.original.length,
    });
    expect(await usedBytesOf(storage.owner, context.client.id)).toBe(
      before + BigInt(context.original.length),
    );
    expect((await versionsOf(context.fileId))[0]?.conservada_hasta).toEqual(
      original?.conservada_hasta,
    );
  });

  it('CA-10: un resultado real no menor se descarta sin subir un objeto ni alterar cuota', async () => {
    const context = await prepare();
    const optimizer = worker.app.get<IOptimizer>(I_OPTIMIZER);
    jest.spyOn(optimizer, 'optimize').mockResolvedValueOnce(context.original);
    expect((await run(context)).status).toBe(202);
    const row = await waitFor(context.fileId);
    expect(row).toMatchObject({
      estado: 'descartada',
      motivo: 'ahorro_minimo',
      bytes_resultado: String(context.original.length),
    });
    expect(await versionsOf(context.fileId)).toHaveLength(1);
    expect(await storage.versionsOf(keyOf(context, row.version_resultado_id ?? ''))).toBe(0);
    expect(await usedBytesOf(storage.owner, context.client.id)).toBe(
      BigInt(context.original.length),
    );
  });

  it('CA-9: un resultado real de dimensiones distintas falla por integridad sin subirlo', async () => {
    const context = await prepare();
    const optimizer = worker.app.get<IOptimizer>(I_OPTIMIZER);
    jest.spyOn(optimizer, 'optimize').mockResolvedValueOnce(await pngWithAlpha(10, 10));
    expect((await run(context)).status).toBe(202);
    const row = await waitFor(context.fileId);
    expect(row).toMatchObject({ estado: 'fallida', motivo: 'integridad', bytes_resultado: null });
    expect(await versionsOf(context.fileId)).toHaveLength(1);
    expect(await storage.versionsOf(keyOf(context, row.version_resultado_id ?? ''))).toBe(0);
  });

  it('CA-12: el CAS real impide cambiar el id preasignado y sobrescribir un claim posterior', async () => {
    const context = await prepare();
    await queue.pause();
    expect((await run(context)).status).toBe(202);
    const app = storage.testApp.app;
    const jobs = app.get<IJobRepository>(I_JOB_REPOSITORY);
    const transactions = app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
    const actor = createActor(context.client.id, Role.CLIENT);
    await transactions.withActor(actor, async () => {
      const job = await jobs.findById(actor, context.optimizationId);
      if (job === null) throw new Error('Falta la ejecución');
      const changedId = OptimizationJob.rehydrate({
        ...job.snapshot(),
        resultVersionId: randomUUID(),
      });
      expect(await jobs.compareAndSet(actor, changedId, job)).toBe(false);
      const later = new Date(job.snapshot().updatedAt.getTime() + 1000);
      expect(await jobs.compareAndSet(actor, job.claim(later), job)).toBe(true);
      expect(await jobs.compareAndSet(actor, job.fail(later), job)).toBe(false);
    });
    await queue.resume();
    expect((await waitFor(context.fileId)).estado).toBe('completada');
  });
});
