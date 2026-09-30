import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { z } from 'zod';

import { MINIO_CONFIG } from '../../shared';
import type { MinioConfig, workerEnvSchema } from '../../shared';
import { AuditModule } from '../audit';

import { I_EXPIRED_UPLOAD_SCANNER } from './application/ports/i-expired-upload.scanner.port';
import { I_OBJECT_STORAGE } from './application/ports/i-object-storage.port';
import type { IObjectStorage } from './application/ports/i-object-storage.port';
import { UPLOAD_CONFIG } from './application/upload-config';
import type { UploadConfig } from './application/upload-config';
import {
  buildMinioStorageClients,
  MinioStorageAdapter,
} from './infrastructure/minio-storage.adapter';
import { SqlExpiredUploadScanner } from './infrastructure/persistence/sql-expired-upload.scanner';
import { UploadCleanupProcessor } from './infrastructure/upload-cleanup.processor';
import {
  UPLOAD_CLEANUP_CONFIG,
  UPLOAD_CLEANUP_QUEUE,
  UploadCleanupScheduler,
} from './infrastructure/upload-cleanup.scheduler';
import type { UploadCleanupConfig } from './infrastructure/upload-cleanup.scheduler';
import { UPLOAD_LIFECYCLE_PROVIDERS } from './upload-lifecycle.providers';

/** Variables del `worker` que `storage` usa (plan §5); las de MinIO llegan por `MINIO_CONFIG`. */
export type StorageWorkerEnv = Pick<
  z.infer<typeof workerEnvSchema>,
  'UPLOAD_CLEANUP_INTERVAL_MINUTES' | 'UPLOAD_CLEANUP_BATCH_SIZE'
>;

const uploadConfigUnavailable = (): never => {
  throw new Error(
    'La configuración de carga no existe en el worker: solo vence cargas. Inicia, reanuda o completa desde el api.',
  );
};

/**
 * `UploadService` pide `UPLOAD_CONFIG`, pero el `worker` solo llama `expire`, que no la lee; las variables de carga son
 * del `api` (plan §5). En vez de inventar valores, cada campo falla al leerse.
 */
const WORKER_UPLOAD_CONFIG: UploadConfig = Object.freeze({
  get partSizeBytes(): bigint {
    return uploadConfigUnavailable();
  },
  get multipartThresholdBytes(): bigint {
    return uploadConfigUnavailable();
  },
  get urlTtlSeconds(): number {
    return uploadConfigUnavailable();
  },
  get initPerMinute(): number {
    return uploadConfigUnavailable();
  },
});

/**
 * Parte de `storage` que corre en el `worker` (CA-9, D-6, ADR-0021): la cola `upload-cleanup`, su programa repetible y
 * el procesador, que vence cargas con `UploadService.expire`. `apps/worker` la importa solo desde `storage/index.ts`.
 * Como `StorageModule`, **no** enlaza `I_PLAN_LIMITS_PROVIDER` (DF-51): lo hace `WorkerModule`. El adaptador de MinIO
 * firma contra el endpoint interno porque el `worker` no tiene `MINIO_PUBLIC_ENDPOINT` ni emite URLs (plan §5): solo
 * aborta partes y borra objetos.
 */
@Module({})
export class StorageWorkerModule {
  static forRoot(env: StorageWorkerEnv): DynamicModule {
    const cleanupConfig: UploadCleanupConfig = {
      intervalMinutes: env.UPLOAD_CLEANUP_INTERVAL_MINUTES,
      batchSize: env.UPLOAD_CLEANUP_BATCH_SIZE,
    };
    return {
      module: StorageWorkerModule,
      imports: [AuditModule, BullModule.registerQueue({ name: UPLOAD_CLEANUP_QUEUE })],
      providers: [
        { provide: UPLOAD_CLEANUP_CONFIG, useValue: cleanupConfig },
        { provide: UPLOAD_CONFIG, useValue: WORKER_UPLOAD_CONFIG },
        {
          provide: I_OBJECT_STORAGE,
          inject: [MINIO_CONFIG],
          useFactory: (config: MinioConfig): IObjectStorage =>
            new MinioStorageAdapter(
              buildMinioStorageClients(config, config.MINIO_ENDPOINT),
              config.MINIO_BUCKET,
            ),
        },
        { provide: I_EXPIRED_UPLOAD_SCANNER, useClass: SqlExpiredUploadScanner },
        ...UPLOAD_LIFECYCLE_PROVIDERS,
        UploadCleanupScheduler,
        UploadCleanupProcessor,
      ],
    };
  }
}
