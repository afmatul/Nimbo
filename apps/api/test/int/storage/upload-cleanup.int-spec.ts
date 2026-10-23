import { randomUUID } from 'node:crypto';

import {
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueEvents } from 'bullmq';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import {
  I_PLAN_LIMITS_PROVIDER,
  StorageModule,
  StorageWorkerModule,
} from '../../../src/modules/storage';
import { UploadService } from '../../../src/modules/storage/application/upload.service';
import { TypeOrmQuotaRepository } from '../../../src/modules/storage/infrastructure/persistence/typeorm-quota.repository';
import { UPLOAD_CLEANUP_QUEUE } from '../../../src/modules/storage/infrastructure/upload-cleanup.scheduler';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { createActor, FixedClock, I_CLOCK, Role } from '../../../src/shared';
import { buildBullConnection } from '../../../src/shared/infrastructure/queue/bull.config';
import { connectAsOwner, requiredEnv } from '../../support/database-urls';
import { FakePlanLimitsProvider } from '../../support/fake-plan-limits.provider';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

import {
  connectAsAppDatabase,
  insertAccount,
  insertUpload,
  removeAccounts,
} from './storage-test-db';
import type { AppDatabase } from './storage-test-db';

const MIB = 1024 * 1024;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
/** Límites del doble de `IPlanLimitsProvider` (R-3): cifras de prueba, no del catálogo de planes (RN-1). */
const TEST_LIMITS = {
  maxFileBytes: BigInt(64 * MIB),
  storageQuotaBytes: BigInt(256 * MIB),
  trashRetentionDays: 30,
  retainedVersions: 3,
  readOnly: false,
  maxEditors: 0,
  planName: 'Plan de prueba',
};
/** Un `.pdf` mínimo que el detector acepta: la firma `%PDF-` y relleno. */
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 0x20)]);
/** Lo declarado de la carga por partes (dos partes de 8 MiB, las de `insertUpload`) y una primera parte ya subida. */
const MULTIPART_BYTES = BigInt(16 * MIB);
const PART_BYTES = Buffer.alloc(MIB, 0x61);
/** Un día: el programa repetible no corre por su cuenta durante la suite; cada barrido lo encola la prueba. */
const CLEANUP_INTERVAL_MINUTES = '1440';
/** Vueltas de la carrera `complete` ↔ `expire`: cada una es una carga nueva; el invariante vale en todas. */
const RACE_ROUNDS = 6;
const JOB_TIMEOUT_MS = 60_000;

interface UploadRow {
  readonly estado: string;
  readonly clave_objeto: string;
  readonly archivo_id: string;
}

/**
 * Barrido de cargas vencidas de punta a punta (CA-9, D-6, ADR-0021): el `worker` (`StorageWorkerModule` como lo compone
 * `WorkerModule`, `nimbo_app` sin actor) consume `upload-cleanup` contra Postgres, Redis y MinIO reales; la API
 * (`StorageModule`) atiende `resume` y `complete`. Cada app tiene su reloj: la de la API se fija antes del vencimiento
 * para que `complete` compita de verdad con `expire` en la carrera del compare-and-set.
 */
describe('upload-cleanup de punta a punta (CA-9)', () => {
  let worker: TestApp;
  let api: TestApp;
  let owner: DataSource;
  let app: AppDatabase;
  let s3: S3Client;
  let queueEvents: QueueEvents;
  let tokens: TestAccessTokens;
  const apiClock = new FixedClock(new Date());
  const accounts: string[] = [];
  const bucket = requiredEnv('MINIO_BUCKET');

  const uploadRow = async (uploadId: string): Promise<UploadRow> => {
    const rows = (await owner.query(
      'SELECT estado, clave_objeto, archivo_id FROM carga WHERE id = $1',
      [uploadId],
    )) as UploadRow[];
    const [row] = rows;
    if (row === undefined) throw new Error('La carga no existe');
    return row;
  };

  const fileExists = async (fileId: string): Promise<boolean> => {
    const rows = (await owner.query('SELECT 1 FROM archivo WHERE id = $1', [fileId])) as unknown[];
    return rows.length > 0;
  };

  const objectExists = async (key: string): Promise<boolean> => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'NotFound') return false;
      throw error;
    }
  };

  /** Encola un barrido como el programa repetible, espera a que termine (o falle) y devuelve su `correlationId`. */
  const runSweep = async (): Promise<string> => {
    const queue = worker.app.get<Queue>(getQueueToken(UPLOAD_CLEANUP_QUEUE));
    const correlationId = randomUUID();
    const job = await queue.add('sweep', { correlationId });
    await job.waitUntilFinished(queueEvents, JOB_TIMEOUT_MS);
    return correlationId;
  };

  const newAccount = async (): Promise<string> => {
    const id = await owner.transaction((manager) => insertAccount(manager));
    accounts.push(id);
    return id;
  };

  beforeAll(async () => {
    const apiEnv = buildTestEnv();
    api = await createTestApp({
      validatedEnv: apiEnv,
      modules: [PlanLimitsBindingModule, StorageModule.forRoot(apiEnv)],
      overrides: [
        { provide: I_PLAN_LIMITS_PROVIDER, useValue: new FakePlanLimitsProvider(TEST_LIMITS) },
        { provide: I_CLOCK, useValue: apiClock },
      ],
    });
    // El `PinoLogger` de `nestjs-pino` es estático: la última app creada recibe las bitácoras de ambas.
    const workerEnv = buildTestEnv(
      { UPLOAD_CLEANUP_INTERVAL_MINUTES: CLEANUP_INTERVAL_MINUTES },
      { withWorkerEnv: true },
    );
    worker = await createTestApp({
      validatedEnv: workerEnv,
      modules: [PlanLimitsBindingModule, StorageWorkerModule.forRoot(workerEnv)],
      prefix: '',
    });
    tokens = new TestAccessTokens(apiClock);
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    s3 = new S3Client({
      endpoint: requiredEnv('MINIO_ENDPOINT'),
      region: requiredEnv('MINIO_REGION'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: requiredEnv('MINIO_ACCESS_KEY'),
        secretAccessKey: requiredEnv('MINIO_SECRET_KEY'),
      },
    });
    queueEvents = new QueueEvents(UPLOAD_CLEANUP_QUEUE, {
      connection: buildBullConnection(requiredEnv('REDIS_URL')),
    });
    await queueEvents.waitUntilReady();
  });

  afterAll(async () => {
    await queueEvents.close();
    await Promise.all([worker.close(), api.close()]);
    await app.dataSource.destroy();
    await removeAccounts(owner, accounts);
    await owner.destroy();
    s3.destroy();
  });

  it('CA-9: el trabajo vence la carga por partes, aborta sus partes, libera la reserva y `resume` responde 410', async () => {
    const ownerId = await newAccount();
    const expiresAt = new Date(Date.now() - HOUR_MS);
    const uploadId = await owner.transaction((manager) =>
      insertUpload(manager, ownerId, {
        mode: 'por_partes',
        sizeBytes: MULTIPART_BYTES,
        expiresAt,
      }),
    );
    const key = (await uploadRow(uploadId)).clave_objeto;
    const multipart = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key }));
    const s3UploadId = multipart.UploadId ?? '';
    await s3.send(
      new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: s3UploadId,
        PartNumber: 1,
        Body: PART_BYTES,
      }),
    );
    await owner.query('UPDATE carga SET upload_id = $1 WHERE id = $2', [s3UploadId, uploadId]);
    const actor = createActor(ownerId, Role.CLIENT);
    const quotas = new TypeOrmQuotaRepository(app.context);
    const reservedBefore = (now: Date) =>
      app.runner.withActor(
        actor,
        async () => (await quotas.lockAndReadUsage(actor, now)).reservedBytes,
      );
    const beforeExpiry = new Date(expiresAt.getTime() - MINUTE_MS);
    expect(await reservedBefore(beforeExpiry)).toBe(MULTIPART_BYTES);

    const correlationId = await runSweep();

    expect((await uploadRow(uploadId)).estado).toBe('expirada');
    await expect(
      s3.send(new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: s3UploadId })),
    ).rejects.toMatchObject({ name: 'NoSuchUpload' });
    expect(await reservedBefore(beforeExpiry)).toBe(0n);
    apiClock.set(new Date());
    const token = tokens.valid({ userId: ownerId, role: Role.CLIENT, sessionId: randomUUID() });
    const resumed = await request(api.app.getHttpServer())
      .post(`/api/v1/uploads/${uploadId}/resume`)
      .set('Authorization', `Bearer ${token}`);
    expect(resumed.status).toBe(410);
    expect(resumed.body).toMatchObject({ code: 'STORAGE_UPLOAD_EXPIRED' });
    expect(worker.logs.withCorrelationId(correlationId)).toContainEqual(
      expect.objectContaining({ event: 'upload.cleanup_run', failed: 0 }),
    );
  });

  it('CA-9, Art. XI: `complete` y `expire` en paralelo nunca dejan un `archivo` sin objeto', async () => {
    const ownerId = await newAccount();
    const actor = createActor(ownerId, Role.CLIENT);
    const uploads = api.app.get(UploadService);

    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const expiresAt = new Date(Date.now() - 1000);
      const uploadId = await owner.transaction((manager) =>
        insertUpload(manager, ownerId, { sizeBytes: BigInt(PDF_BYTES.length), expiresAt }),
      );
      const row = await uploadRow(uploadId);
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: row.clave_objeto, Body: PDF_BYTES }),
      );
      apiClock.set(new Date(expiresAt.getTime() - MINUTE_MS));

      await Promise.allSettled([uploads.complete(actor, uploadId), runSweep()]);

      const after = await uploadRow(uploadId);
      expect(['completada', 'expirada']).toContain(after.estado);
      const registered = await fileExists(after.archivo_id);
      expect(registered).toBe(after.estado === 'completada');
      expect(await objectExists(after.clave_objeto)).toBe(registered);
    }
  });
});
