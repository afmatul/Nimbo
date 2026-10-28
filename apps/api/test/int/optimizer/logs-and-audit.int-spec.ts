import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { optimizationStatusSchema } from '@nimbo/contracts';
import type { Queue } from 'bullmq';
import request from 'supertest';

import { I_AUDIT_LOGGER } from '../../../src/modules/audit';
import type { IAuditLogger } from '../../../src/modules/audit';
import { OptimizerModule } from '../../../src/modules/optimizer';
import { OptimizationRunner } from '../../../src/modules/optimizer/application/optimization-runner';
import { I_JOB_REPOSITORY } from '../../../src/modules/optimizer/application/ports/i-job.repository.port';
import type { IJobRepository } from '../../../src/modules/optimizer/application/ports/i-job.repository.port';
import { I_OPTIMIZER } from '../../../src/modules/optimizer/application/ports/i-optimizer.port';
import type { IOptimizer } from '../../../src/modules/optimizer/application/ports/i-optimizer.port';
import { OptimizerWorkerModule } from '../../../src/modules/optimizer/worker';
import {
  I_PLAN_LIMITS_PROVIDER,
  OptimizableFileGateway,
  StorageFacadesWorkerModule,
} from '../../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { CorrelationContext, TransactionContext } from '../../../src/shared';
import { pngWithAlpha } from '../../support/image-fixtures';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { createStorageHttpApp, STORAGE_HTTP_BUCKET } from '../storage/storage-http';
import type { StorageClient, StorageHttpApp } from '../storage/storage-http';

const SECRET = 'sintetico-confidencial';
const SENSITIVE_ERROR = `${SECRET}.png u/${SECRET} https://secreto/?signature=${SECRET} C:\\temp\\${SECRET}`;
const ACTIONS = ['file.optimized', 'file.optimization_discarded', 'file.optimization_failed'];

interface Context {
  client: StorageClient;
  fileId: string;
  id: string;
  correlationId: string;
  original: Buffer;
}
interface Row {
  estado: string;
  motivo: string | null;
  version_origen_id: string;
  version_resultado_id: string | null;
  bytes_resultado: string | null;
}
interface AuditRow {
  accion: string;
  actor_id: string;
  rol_actor: string;
  usuario_afectado_id: string;
  tipo_recurso: string;
  recurso_id: string;
  correlation_id: string;
  atributos: Record<string, unknown>;
}

describe('021 T-05 CA-21: logs y auditoría persistente (Postgres, Redis, MinIO y sharp)', () => {
  let storage: StorageHttpApp;
  let worker: TestApp;
  let queue: Queue;

  beforeAll(async () => {
    storage = await createStorageHttpApp({
      withStorage: (module, env) => [OptimizerModule.forRoot(env, { storage: module })],
    });
    const env = buildTestEnv(
      { MINIO_BUCKET: STORAGE_HTTP_BUCKET, OPTIMIZER_MIN_SAVED_BYTES: '100' },
      { withWorkerEnv: true },
    );
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
    await queue.resume();
  });
  afterAll(async () => {
    await queue?.obliterate({ force: true });
    await worker?.close();
    await storage?.close();
  });

  const http = () => request(storage.testApp.app.getHttpServer());
  const auth = (context: Pick<Context, 'client'>) => ({
    Authorization: `Bearer ${storage.tokenOf(context.client.id) ?? ''}`,
  });
  const rowOf = async (context: Context): Promise<Row> => {
    const [row] = await storage.owner.query<Row[]>('SELECT * FROM optimizacion WHERE id = $1', [
      context.id,
    ]);
    if (row === undefined) throw new Error('Falta la optimización');
    return row;
  };
  const auditsOf = (context: Context): Promise<AuditRow[]> =>
    storage.owner.query(
      'SELECT * FROM evento_auditoria WHERE recurso_id = $1 AND accion = ANY($2) ORDER BY ocurrido_en, id',
      [context.fileId, ACTIONS],
    );
  const waitFor = async (context: Context): Promise<Row> => {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const row = await rowOf(context);
      if (!['estimando', 'optimizando'].includes(row.estado)) return row;
      if (Date.now() >= deadline) throw new Error('Falta el resultado terminal');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const observeCommit = (context: Context): void => {
    for (const testApp of [storage.testApp, worker]) {
      const audit = testApp.app.get<IAuditLogger>(I_AUDIT_LOGGER);
      const record = audit.record.bind(audit);
      jest.spyOn(audit, 'record').mockImplementation(async (entry) => {
        if (ACTIONS.includes(entry.action)) {
          expect(testApp.app.get(TransactionContext).current()).toBeUndefined();
          expect(['completada', 'descartada', 'fallida']).toContain((await rowOf(context)).estado);
        }
        await record(entry);
      });
    }
  };
  const prepare = async (): Promise<Context> => {
    const client = await storage.newClient();
    const original = await pngWithAlpha(200, 150);
    const uploaded = await client.upload(`${SECRET}.png`, original);
    expect(uploaded.status).toBe(200);
    const fileId = (uploaded.body as { file: { id: string } }).file.id;
    const response = await http()
      .post(`/api/v1/files/${fileId}/optimization/estimate`)
      .set(auth({ client }));
    expect(response.status).toBe(202);
    const context = {
      client,
      fileId,
      original,
      id: optimizationStatusSchema.parse(response.body).id,
      correlationId: randomUUID(),
    };
    expect((await waitFor(context)).estado).toBe('estimada');
    expect(await auditsOf(context)).toEqual([]);
    observeCommit(context);
    return context;
  };
  const run = (context: Context) =>
    http()
      .post(`/api/v1/files/${context.fileId}/optimization/run`)
      .set(auth(context))
      .set('x-correlation-id', context.correlationId)
      .send({ optimizationId: context.id });
  const expectedAttributes = (context: Context, row: Row): Record<string, unknown> => ({
    optimizationId: context.id,
    sourceVersionId: row.version_origen_id,
    originalBytes: context.original.length,
    ...(row.bytes_resultado === null ? {} : { resultBytes: Number(row.bytes_resultado) }),
    ...(row.estado === 'completada'
      ? { versionId: row.version_resultado_id }
      : { reason: row.motivo }),
  });
  const expectAudit = async (context: Context, action: string): Promise<void> => {
    const deadline = Date.now() + 3000;
    while ((await auditsOf(context)).length === 0 && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 25));
    const row = await rowOf(context);
    const entries = await auditsOf(context);
    const attributes = expectedAttributes(context, row);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      accion: action,
      actor_id: context.client.id,
      rol_actor: 'CLIENT',
      usuario_afectado_id: context.client.id,
      tipo_recurso: 'file',
      recurso_id: context.fileId,
      correlation_id: context.correlationId,
      atributos: attributes,
    });
    expect(entries[0]?.atributos).toEqual(attributes);
    expectSafeLogs(context, action, row);
    expect(JSON.stringify(entries)).not.toContain(SECRET);
  };
  const expectSafeLogs = (context: Context, action: string, row: Row): void => {
    const lines = worker.logs.withCorrelationId(context.correlationId);
    expect(lines.some((line) => line.event === 'audit.record' && line.action === action)).toBe(
      true,
    );
    const outcome = lines.find(
      (line) =>
        String(line.event).startsWith('optimization.') && line.optimizationId === context.id,
    );
    expect(outcome).toMatchObject({
      fileId: context.fileId,
      optimizationId: context.id,
      actorId: context.client.id,
      sourceVersionId: row.version_origen_id,
      versionId: row.version_resultado_id,
      originalBytes: context.original.length,
      resultBytes: row.bytes_resultado === null ? null : Number(row.bytes_resultado),
      reason: row.motivo,
    });
    const serialized = JSON.stringify(lines);
    for (const forbidden of [
      SECRET,
      'signature=',
      'https://secreto',
      'C:\\temp',
      'u/',
      'stack',
      'objectKey',
      'fileName',
      'tempPath',
    ])
      expect(serialized).not.toContain(forbidden);
  };

  it.each([
    ['completada', 'file.optimized'],
    ['descartada', 'file.optimization_discarded'],
    ['fallida', 'file.optimization_failed'],
  ])('CA-21: %s escribe %s con actor, recurso, allowlist y correlación', async (state, action) => {
    const context = await prepare();
    const optimizer = worker.app.get<IOptimizer>(I_OPTIMIZER);
    if (state === 'descartada')
      jest.spyOn(optimizer, 'optimize').mockResolvedValueOnce(context.original);
    if (state === 'fallida')
      jest.spyOn(optimizer, 'optimize').mockResolvedValueOnce(await pngWithAlpha(10, 10));
    expect((await run(context)).status).toBe(202);
    expect((await waitFor(context)).estado).toBe(state);
    await expectAudit(context, action);
    await http().get(`/api/v1/files/${context.fileId}/optimization`).set(auth(context));
    const task = { optimizationId: context.id, fileId: context.fileId, ownerId: context.client.id };
    await worker.app.get(OptimizationRunner).run(task);
    expect(await auditsOf(context)).toHaveLength(1);
  });

  it('CA-21: doble clic concurrente emite un solo resultado de negocio', async () => {
    const context = await prepare();
    await queue.pause();
    const responses = await Promise.all([run(context), run(context)]);
    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    expect(await auditsOf(context)).toEqual([]);
    await queue.resume();
    expect((await waitFor(context)).estado).toBe('completada');
    await expectAudit(context, 'file.optimized');
  });

  it('CA-21: retry tras storage registrado y antes del commit terminal no duplica auditoría', async () => {
    const context = await prepare();
    const jobs = worker.app.get<IJobRepository>(I_JOB_REPOSITORY);
    const cas = jobs.compareAndSet.bind(jobs);
    let failOnce = true;
    jest.spyOn(jobs, 'compareAndSet').mockImplementation(async (actor, next, previous) => {
      if (next.state === 'completada' && failOnce) {
        failOnce = false;
        expect(await cas(actor, next, previous)).toBe(true);
        expect((await rowOf(context)).estado).toBe('optimizando');
        expect(await auditsOf(context)).toEqual([]);
        throw new Error(SENSITIVE_ERROR);
      }
      return cas(actor, next, previous);
    });
    const gateway = worker.app.get(OptimizableFileGateway);
    const recover = jest.spyOn(gateway, 'findRegisteredOptimization');
    expect((await run(context)).status).toBe(202);
    expect((await waitFor(context)).estado).toBe('completada');
    expect(recover.mock.calls.length).toBeGreaterThanOrEqual(2);
    await expectAudit(context, 'file.optimized');
  });

  it('CA-21: agotamiento de intentos audita el fallo una vez y oculta el error crudo', async () => {
    const context = await prepare();
    jest
      .spyOn(worker.app.get<IOptimizer>(I_OPTIMIZER), 'optimize')
      .mockRejectedValue(new Error(SENSITIVE_ERROR));
    expect((await run(context)).status).toBe(202);
    expect((await waitFor(context)).estado).toBe('fallida');
    await expectAudit(context, 'file.optimization_failed');
    await worker.app
      .get(OptimizationRunner)
      .giveUp(
        { optimizationId: context.id, fileId: context.fileId, ownerId: context.client.id },
        new Error(SENSITIVE_ERROR),
      );
    expect(await auditsOf(context)).toHaveLength(1);
  });

  it('CA-21: caducidad de run en API audita después del commit, polling posterior no repite', async () => {
    const context = await prepare();
    await queue.pause();
    expect((await run(context)).status).toBe(202);
    await storage.owner.query(
      "UPDATE optimizacion SET actualizado_en = now() - interval '1 day' WHERE id = $1",
      [context.id],
    );
    const response = await http()
      .get(`/api/v1/files/${context.fileId}/optimization`)
      .set(auth(context))
      .set('x-correlation-id', context.correlationId);
    expect(response.status).toBe(200);
    expect((await rowOf(context)).estado).toBe('fallida');
    await expectAudit(context, 'file.optimization_failed');
    await http().get(`/api/v1/files/${context.fileId}/optimization`).set(auth(context));
    expect(await auditsOf(context)).toHaveLength(1);
    await CorrelationContext.run({ correlationId: context.correlationId }, () =>
      worker.app
        .get(OptimizationRunner)
        .run({ optimizationId: context.id, fileId: context.fileId, ownerId: context.client.id }),
    );
    expect(await auditsOf(context)).toHaveLength(1);
  });
});
