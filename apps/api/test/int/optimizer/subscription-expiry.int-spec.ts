import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { fileVersionsResponseSchema, optimizationStatusSchema } from '@nimbo/contracts';
import type { Queue } from 'bullmq';
import request from 'supertest';

import { BillingWorkerModule, PlanLimitsAdapter } from '../../../src/modules/billing';
import { SubscriptionRenewer } from '../../../src/modules/billing/application/subscription-renewer';
import { RenewalProcessor } from '../../../src/modules/billing/infrastructure/renewal.processor';
import { I_NOTIFIER } from '../../../src/modules/notifications';
import type { MailMessage } from '../../../src/modules/notifications';
import { OptimizerModule } from '../../../src/modules/optimizer';
import { OptimizerWorkerModule } from '../../../src/modules/optimizer/worker';
import {
  I_PLAN_LIMITS_PROVIDER,
  StorageFacadesWorkerModule,
  StorageWorkerModule,
  WritableAccountPolicy,
} from '../../../src/modules/storage';
import type { IPlanLimitsProvider } from '../../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { createActor, Role } from '../../../src/shared';
import { pngWithAlpha } from '../../support/image-fixtures';
import { buildOptimizerTestEnv } from '../../support/optimizer-env';
import { inDays, PERIOD_MS, subscriptionOf, TEAM_ID } from '../billing/subscription-accounts';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { createStorageHttpApp, STORAGE_HTTP_BUCKET, usedBytesOf } from '../storage/storage-http';
import type { StorageClient, StorageHttpApp } from '../storage/storage-http';
import { removeAccounts } from '../storage/storage-test-db';

interface ImageContext {
  readonly client: StorageClient;
  readonly fileId: string;
}

interface OptimizationRow {
  readonly id: string;
  readonly estado: string;
  readonly version_origen_id: string;
}

/** 021 CA-17: renovador de 010 → límites de ADR-0032 → rechazo del optimizador, sin doble de límites. */
describe('021 CA-17: vencimiento de la suscripción hasta optimizer/run', () => {
  let storage: StorageHttpApp;
  let renewalWorker: TestApp;
  let optimizerWorker: TestApp;
  let queue: Queue;
  const accountIds: string[] = [];
  const fileIds: string[] = [];
  const sent: MailMessage[] = [];

  const startRenewalWorker = async (): Promise<TestApp> => {
    const env = buildTestEnv(
      { SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES: '1440', MINIO_BUCKET: STORAGE_HTTP_BUCKET },
      { withWorkerEnv: true },
    );
    return createTestApp({
      validatedEnv: env,
      modules: [
        PlanLimitsBindingModule,
        BillingWorkerModule.forRoot(env, StorageWorkerModule.forRoot(env)),
      ],
      overrides: [
        {
          provide: I_NOTIFIER,
          useValue: { notify: (message: MailMessage) => (sent.push(message), Promise.resolve()) },
        },
      ],
      prefix: '',
    });
  };

  const startOptimizerWorker = async (): Promise<TestApp> => {
    const env = buildOptimizerTestEnv({
      MINIO_BUCKET: STORAGE_HTTP_BUCKET,
      // El mismo umbral de bytes de las otras suites para imágenes pequeñas; porcentaje y sharp reales.
      OPTIMIZER_MIN_SAVED_BYTES: '100',
    });
    const facades = StorageFacadesWorkerModule.forRoot();
    return createTestApp({
      validatedEnv: env,
      accessTokenStrategy: 'identity',
      modules: [PlanLimitsBindingModule, facades, OptimizerWorkerModule.forRoot(env, facades)],
      prefix: '',
    });
  };

  beforeAll(async () => {
    storage = await createStorageHttpApp({
      realPlanLimits: true,
      withStorage: (module, env) => [OptimizerModule.forRoot(env, { storage: module })],
    });
    renewalWorker = await startRenewalWorker();
    // El primer job del scheduler puede arrancar de inmediato: termina antes de crear los fixtures.
    await renewalWorker.app.get(RenewalProcessor).worker.pause();
    optimizerWorker = await startOptimizerWorker();
    queue = optimizerWorker.app.get<Queue>(getQueueToken('optimization'));
  });

  const removeFixtures = async (): Promise<void> => {
    if (storage === undefined) return;
    await removeAccounts(storage.owner, accountIds);
    const rows = await storage.owner.query<{ tabla: string; id: string }[]>(
      `SELECT 'usuario' AS tabla, id FROM usuario WHERE id = ANY($1)
       UNION ALL SELECT 'suscripcion', id FROM suscripcion WHERE usuario_id = ANY($1)
       UNION ALL SELECT 'archivo', id FROM archivo WHERE propietario_id = ANY($1)
       UNION ALL SELECT 'version_archivo', id FROM version_archivo WHERE archivo_id = ANY($2)
       UNION ALL SELECT 'optimizacion', id FROM optimizacion WHERE archivo_id = ANY($2)`,
      [accountIds, fileIds],
    );
    expect(rows).toEqual([]);
  };

  afterAll(async () => {
    jest.restoreAllMocks();
    try {
      await queue?.obliterate({ force: true });
      await optimizerWorker?.close();
      await renewalWorker?.close();
      await removeFixtures();
    } finally {
      await storage?.close();
    }
  });

  /** Suscripción ficticia: nunca escribe `estado`; la transición pertenece a SubscriptionRenewer. */
  const setFixturePeriod = async (client: StorageClient, expiresAt: Date): Promise<void> => {
    await storage.owner.query(
      `INSERT INTO suscripcion (usuario_id, plan_id, iniciado_en, vence_en, renovacion_automatica)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT (usuario_id) DO UPDATE
         SET plan_id = EXCLUDED.plan_id, iniciado_en = EXCLUDED.iniciado_en,
             vence_en = EXCLUDED.vence_en, renovacion_automatica = false`,
      [client.id, TEAM_ID, new Date(expiresAt.getTime() - PERIOD_MS), expiresAt],
    );
  };

  const paidImage = async (): Promise<ImageContext> => {
    const client = await storage.newClient();
    accountIds.push(client.id);
    await setFixturePeriod(client, inDays(1));
    const response = await client.upload(`${randomUUID()}.png`, await pngWithAlpha(200, 150));
    expect(response.status).toBe(200);
    const fileId = (response.body as { file: { id: string } }).file.id;
    fileIds.push(fileId);
    return { client, fileId };
  };

  const providerFor = (app: TestApp): PlanLimitsAdapter => {
    const provider = app.app.get<IPlanLimitsProvider>(I_PLAN_LIMITS_PROVIDER);
    expect(provider).toBeInstanceOf(PlanLimitsAdapter);
    expect(provider).toBe(app.app.get(PlanLimitsAdapter));
    return app.app.get(PlanLimitsAdapter);
  };

  const expire = async (context: ImageContext): Promise<void> => {
    const actor = createActor(context.client.id, Role.CLIENT);
    const renewer = renewalWorker.app.get(SubscriptionRenewer);
    const limitsBefore = await providerFor(storage.testApp).limitsFor(actor);
    expect(limitsBefore).toMatchObject({ planName: 'Equipo', readOnly: false });
    await expect(
      storage.testApp.app.get(WritableAccountPolicy).assertWritable(actor),
    ).resolves.toBeUndefined();
    await expect(renewer.renew(actor)).resolves.toBe('skipped');
    await setFixturePeriod(context.client, inDays(-1));
    expect(await subscriptionOf(storage.owner, actor.id)).toMatchObject({ estado: 'vigente' });
    await expect(renewer.renew(actor)).resolves.toBe('readOnly');
    expect(await subscriptionOf(storage.owner, actor.id)).toMatchObject({
      estado: 'solo_lectura',
      plan_id: TEAM_ID,
    });
    for (const app of [storage.testApp, renewalWorker, optimizerWorker]) {
      expect(await providerFor(app).limitsFor(actor)).toEqual({ ...limitsBefore, readOnly: true });
    }
    expect(sent).toEqual([
      expect.objectContaining({ recipientId: actor.id, tag: 'billing.expired' }),
    ]);
  };

  const post = (context: ImageContext, action: 'estimate' | 'run') =>
    request(storage.testApp.app.getHttpServer())
      .post(`/api/v1/files/${context.fileId}/optimization/${action}`)
      .set({ Authorization: `Bearer ${storage.tokenOf(context.client.id) ?? ''}` });

  const optimizationOf = async (fileId: string): Promise<OptimizationRow> => {
    const [row] = await storage.owner.query<OptimizationRow[]>(
      'SELECT * FROM optimizacion WHERE archivo_id = $1',
      [fileId],
    );
    if (row === undefined) throw new Error('Falta la optimización del fixture');
    return row;
  };

  const estimate = async (context: ImageContext): Promise<OptimizationRow> => {
    const response = await post(context, 'estimate');
    expect(response.status).toBe(202);
    const requested = optimizationStatusSchema.parse(response.body);
    expect(requested.state).toBe('estimando');
    const deadline = Date.now() + 30_000;
    for (;;) {
      const row = await optimizationOf(context.fileId);
      if (row.estado !== 'estimando') {
        expect(row).toMatchObject({ id: requested.id, estado: 'estimada' });
        return row;
      }
      if (Date.now() >= deadline) throw new Error('La estimación no terminó');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  const snapshotOf = async (context: ImageContext) => {
    const history = await context.client.fileVersions(context.fileId);
    expect(history.status).toBe(200);
    return {
      usedBytes: await usedBytesOf(storage.owner, context.client.id),
      history: fileVersionsResponseSchema.parse(history.body),
      file: await storage.owner.query<Record<string, unknown>[]>(
        'SELECT * FROM archivo WHERE id = $1',
        [context.fileId],
      ),
      versions: await storage.owner.query<Record<string, unknown>[]>(
        'SELECT * FROM version_archivo WHERE archivo_id = $1 ORDER BY numero',
        [context.fileId],
      ),
      optimizations: await storage.owner.query<Record<string, unknown>[]>(
        'SELECT * FROM optimizacion WHERE archivo_id = $1 ORDER BY id',
        [context.fileId],
      ),
    };
  };

  it('CA-17, ADR-0032: vencer con el renovador real permite estimar y bloquea run sin efectos ni encolado', async () => {
    const context = await paidImage();
    await expire(context);
    const optimization = await estimate(context);
    await queue.pause();
    const before = await snapshotOf(context);
    const actor = createActor(context.client.id, Role.CLIENT);
    const policy = jest.spyOn(storage.testApp.app.get(WritableAccountPolicy), 'assertWritable');
    const limits = jest.spyOn(providerFor(storage.testApp), 'limitsFor');
    const enqueue = jest.spyOn(
      storage.testApp.app.get<Queue>(getQueueToken('optimization')),
      'add',
    );

    const response = await post(context, 'run').send({ optimizationId: optimization.id });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'STORAGE_ACCOUNT_READ_ONLY',
      message:
        'Tu suscripción venció y tu cuenta está en solo lectura. Renueva tu plan para volver a subir, editar y compartir.',
    });
    expect(policy).toHaveBeenCalledWith(actor);
    expect(limits).toHaveBeenCalledWith(actor);
    expect(await snapshotOf(context)).toEqual(before);
    expect(enqueue).not.toHaveBeenCalled();
    expect(await queue.getJob(`run-${optimization.id}`)).toBeUndefined();
  });
});
