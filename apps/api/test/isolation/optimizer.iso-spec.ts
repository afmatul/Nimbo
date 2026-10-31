import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import {
  errorResponseSchema,
  optimizationResponseSchema,
  optimizationStatusSchema,
} from '@nimbo/contracts';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import request from 'supertest';

import { I_AUDIT_LOGGER } from '../../src/modules/audit';
import type { IAuditLogger } from '../../src/modules/audit';
import { OptimizerModule } from '../../src/modules/optimizer';
import { OptimizationService } from '../../src/modules/optimizer/application/optimization.service';
import { OptimizerWorkerModule } from '../../src/modules/optimizer/worker';
import {
  I_PLAN_LIMITS_PROVIDER,
  OptimizableFileGateway,
  StorageFacadesWorkerModule,
} from '../../src/modules/storage';
import { I_NODE_REPOSITORY } from '../../src/modules/storage/application/ports/i-node.repository.port';
import type { INodeRepository } from '../../src/modules/storage/application/ports/i-node.repository.port';
import { PlanLimitsBindingModule } from '../../src/plan-limits-binding.module';
import {
  createActor,
  I_RATE_LIMITER,
  I_TRANSACTION_RUNNER,
  REDIS_CLIENT,
  Role,
} from '../../src/shared';
import type { IRateLimiter, ITransactionRunner } from '../../src/shared';
import { createTestApp } from '../int/setup/test-app';
import type { TestApp } from '../int/setup/test-app';
import { createStorageHttpApp, STORAGE_HTTP_BUCKET } from '../int/storage/storage-http';
import type { StorageHttpApp } from '../int/storage/storage-http';
import { gif, pngWithAlpha, webp } from '../support/image-fixtures';
import { buildOptimizerTestEnv } from '../support/optimizer-env';

import { comparable, INTERNAL_ROLES } from './setup/isolation-assertions';
import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld, WorldAccount } from './setup/isolation-world';

const ROUTES = [
  { name: 'estimate', method: 'post', suffix: '/estimate' },
  { name: 'status', method: 'get', suffix: '' },
  { name: 'run', method: 'post', suffix: '/run' },
] as const;
type Route = (typeof ROUTES)[number];
const TERMINAL_ACTIONS = [
  'file.optimized',
  'file.optimization_discarded',
  'file.optimization_failed',
];
const rateKey = (account: WorldAccount): string => `optimizer:request:${account.id}:60`;

interface Image {
  readonly fileId: string;
  readonly optimizationId: string;
}

/** HTTP con tokens reales, Postgres/RLS como nimbo_app, Redis, MinIO y estimación sharp real (021 CA-19/CA-20). */
describe('021 T-06: aislamiento owner-only del optimizador', () => {
  let world: IsolationWorld;
  let storage: StorageHttpApp;
  let worker: TestApp;
  let queue: Queue;
  let redis: Redis;
  let a: WorldAccount;
  let b: WorldAccount;
  let imageA: Image;
  const unsupported = new Map<string, string>();

  const call = (route: Route, account: WorldAccount | null, image = imageA) => {
    const http = request(storage.testApp.app.getHttpServer());
    const pending = http[route.method](`/api/v1/files/${image.fileId}/optimization${route.suffix}`);
    if (account !== null) pending.set('Authorization', `Bearer ${world.tokenFor(account)}`);
    return route.name === 'run' ? pending.send({ optimizationId: image.optimizationId }) : pending;
  };

  const upload = async (name: string, content: Buffer): Promise<string> => {
    const client = storage.clientFor(a.id, world.tokenFor(a));
    const response = await client.upload(name, content);
    expect(response.status).toBe(200);
    return (response.body as { file: { id: string } }).file.id;
  };

  const waitForEstimate = async (id: string): Promise<void> => {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const [row] = await storage.owner.query<{ estado: string }[]>(
        'SELECT estado FROM optimizacion WHERE id = $1',
        [id],
      );
      if (row?.estado === 'estimada') return;
      if (Date.now() >= deadline)
        throw new Error(`La estimación no terminó: ${row?.estado ?? 'ausente'}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  const startWorker = async (): Promise<void> => {
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
  };

  beforeAll(async () => {
    world = await createIsolationWorld();
    storage = await createStorageHttpApp({
      ...world.appComposition(),
      withStorage: (module, env) => [OptimizerModule.forRoot(env, { storage: module })],
    });
    [a, b] = world.clients;
    queue = storage.testApp.app.get<Queue>(getQueueToken('optimization'));
    redis = storage.testApp.app.get<Redis>(REDIS_CLIENT);
    await startWorker();
    const fileId = await upload('Imagen propia de A.png', await pngWithAlpha(200, 150));
    const response = await call(ROUTES[0], a, { fileId, optimizationId: randomUUID() });
    expect(response.status).toBe(202);
    imageA = { fileId, optimizationId: optimizationStatusSchema.parse(response.body).id };
    await waitForEstimate(imageA.optimizationId);
    await queue.pause();
    unsupported.set('webp', await upload('No compatible.webp', await webp()));
    unsupported.set('gif', await upload('No compatible.gif', await gif()));
  });

  beforeEach(async () => {
    // Cada caso conserva el límite aprobado (10/min); solo reinicia el presupuesto de B entre pruebas independientes.
    await redis.del(rateKey(b));
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await queue?.obliterate({ force: true });
    await worker?.close();
    await storage?.close();
    await world?.close();
  });

  /** La cola está pausada: cualquier cambio aquí sería efecto de una petición rechazada. */
  const snapshot = async () => ({
    optimizations: await storage.owner.query(
      'SELECT * FROM optimizacion WHERE archivo_id = ANY($1) ORDER BY id',
      [[imageA.fileId, ...unsupported.values()]],
    ),
    versions: await storage.owner.query(
      'SELECT id, version_actual_id, tamano_bytes FROM archivo WHERE propietario_id = $1 ORDER BY id',
      [a.id],
    ),
    audit: await storage.owner.query(
      'SELECT * FROM evento_auditoria WHERE usuario_afectado_id = ANY($1) AND accion = ANY($2) ORDER BY id',
      [
        [a.id, b.id, ...Object.values(world.internals).map((account) => account.id)],
        TERMINAL_ACTIONS,
      ],
    ),
    jobs: (await queue.getJobs())
      .map((job) => ({ id: job.id, name: job.name, data: job.data as unknown }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    ownerRate: await redis.zrange(rateKey(a), 0, -1),
  });

  const expectNotFound = async (route: Route, target = imageA): Promise<void> => {
    const audit = jest.spyOn(storage.testApp.app.get<IAuditLogger>(I_AUDIT_LOGGER), 'record');
    const before = await snapshot();
    expect(before.audit).toEqual([]);
    const foreign = await call(route, b, target);
    const missing = await call(route, b, { ...target, fileId: randomUUID() });
    expect(foreign.status).toBe(404);
    expect(errorResponseSchema.parse(foreign.body).code).toBe('STORAGE_NODE_NOT_FOUND');
    expect(comparable(foreign)).toEqual(comparable(missing));
    const body = comparable(foreign).body;
    expect(Object.keys(body).sort()).toEqual(['code', 'message']);
    for (const secret of [a.id, target.fileId, imageA.optimizationId, 'image/png', 'estimada'])
      expect(JSON.stringify(body)).not.toContain(secret);
    expect(await snapshot()).toEqual(before);
    expect(audit).not.toHaveBeenCalled();
  };

  it.each(ROUTES)(
    'CA-19: B → A por $name es idéntico a inexistente, sin efectos',
    async (route) => {
      await expectNotFound(route);
    },
  );

  it.each(['webp', 'gif'])(
    'CA-19: B no descubre el tipo %s ni la vigencia: 404 antes de 422/409',
    async (extension) => {
      const fileId = unsupported.get(extension);
      if (fileId === undefined) throw new Error('Falta el archivo no compatible');
      for (const route of [ROUTES[0], ROUTES[2]])
        await expectNotFound(route, { fileId, optimizationId: imageA.optimizationId });
      const owner = await call(ROUTES[0], a, { fileId, optimizationId: imageA.optimizationId });
      expect(owner.status).toBe(422);
      expect(owner.body).toMatchObject({ code: 'OPTIMIZER_UNSUPPORTED_TYPE' });
    },
  );

  // En esta rama sharing todavía no tiene tablas ni helpers (012). Se simula solo un acceso ampliado al nodo,
  // conservando HTTP, auth y la fachada reales: no representa una compartición real de editor/lector.
  it.each(ROUTES)('RN-5: un nodo ajeno accesible tampoco concede $name', async (route) => {
    const app = storage.testApp.app;
    const nodes = app.get<INodeRepository>(I_NODE_REPOSITORY);
    const owner = createActor(a.id, Role.CLIENT);
    const node = await app
      .get<ITransactionRunner>(I_TRANSACTION_RUNNER)
      .withActor(owner, () => nodes.findAccessibleById(owner, imageA.fileId));
    expect(node?.ownerId).toBe(a.id);
    const accessible = jest.spyOn(nodes, 'findAccessibleById').mockResolvedValueOnce(node);
    await expectNotFound(route);
    expect(accessible.mock.calls[0]).toEqual([createActor(b.id, Role.CLIENT), imageA.fileId]);
  });

  const expectGuarded = async (route: Route, account: WorldAccount | null): Promise<void> => {
    const app = storage.testApp.app;
    const service = app.get(OptimizationService);
    const gateway = app.get(OptimizableFileGateway);
    const spies = [
      jest.spyOn(service, 'estimate'),
      jest.spyOn(service, 'status'),
      jest.spyOn(service, 'run'),
      jest.spyOn(gateway, 'findOwnedImage'),
      jest.spyOn(gateway, 'findOwned'),
      jest.spyOn(app.get<IRateLimiter>(I_RATE_LIMITER), 'consume'),
      jest.spyOn(app.get<IAuditLogger>(I_AUDIT_LOGGER), 'record'),
    ];
    const before = await snapshot();
    const response = await call(route, account);
    expect(response.status).toBe(account === null ? 401 : 403);
    expect(errorResponseSchema.parse(response.body).code).toBe(
      account === null ? 'SHARED_UNAUTHENTICATED' : 'SHARED_FORBIDDEN',
    );
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  };

  it.each(INTERNAL_ROLES.flatMap((role) => ROUTES.map((route) => [role, route] as const)))(
    'CA-20: %s no llega al servicio por %j: 403 sin efectos',
    async (role, route) => {
      await expectGuarded(route, world.internals[role]);
    },
  );

  it.each(ROUTES)(
    'CA-20: sin token por $name: 401 sin llegar a datos ni al rate limiter',
    async (route) => {
      await expectGuarded(route, null);
    },
  );

  it('control positivo: A consulta su estimación, la reutiliza y puede confirmar run', async () => {
    const status = await call(ROUTES[1], a);
    expect(status.status).toBe(200);
    expect(optimizationResponseSchema.parse(status.body).optimization).toMatchObject({
      id: imageA.optimizationId,
      state: 'estimada',
    });
    const estimate = await call(ROUTES[0], a);
    expect(estimate.status).toBe(202);
    expect(optimizationStatusSchema.parse(estimate.body).id).toBe(imageA.optimizationId);
    const run = await call(ROUTES[2], a);
    expect(run.status).toBe(202);
    expect(optimizationStatusSchema.parse(run.body).state).toBe('optimizando');
  });
});
