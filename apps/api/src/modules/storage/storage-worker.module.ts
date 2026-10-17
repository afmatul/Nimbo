import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { z } from 'zod';

import { MINIO_CONFIG } from '../../shared';
import type { MinioConfig, workerEnvSchema } from '../../shared';
import { AuditModule } from '../audit';

import { FOLDER_CONFIG } from './application/folder-config';
import type { FolderConfig } from './application/folder-config';
import { I_CLIENT_ACCOUNT_SCANNER } from './application/ports/i-client-account.scanner.port';
import { I_EXPIRED_TRASH_SCANNER } from './application/ports/i-expired-trash.scanner.port';
import { I_EXPIRED_UPLOAD_SCANNER } from './application/ports/i-expired-upload.scanner.port';
import { I_OBJECT_STORAGE } from './application/ports/i-object-storage.port';
import type { IObjectStorage } from './application/ports/i-object-storage.port';
import { UPLOAD_CONFIG } from './application/upload-config';
import type { UploadConfig } from './application/upload-config';
import { UsageReconciler } from './application/usage-reconciler';
import {
  buildMinioStorageClients,
  MinioStorageAdapter,
} from './infrastructure/minio-storage.adapter';
import { SqlClientAccountScanner } from './infrastructure/persistence/sql-client-account.scanner';
import { SqlExpiredTrashScanner } from './infrastructure/persistence/sql-expired-trash.scanner';
import { SqlExpiredUploadScanner } from './infrastructure/persistence/sql-expired-upload.scanner';
import { TrashPurgeProcessor } from './infrastructure/trash-purge.processor';
import {
  TRASH_PURGE_CONFIG,
  TRASH_PURGE_QUEUE,
  TrashPurgeScheduler,
} from './infrastructure/trash-purge.scheduler';
import type { TrashPurgeConfig } from './infrastructure/trash-purge.scheduler';
import { UploadCleanupProcessor } from './infrastructure/upload-cleanup.processor';
import {
  UPLOAD_CLEANUP_CONFIG,
  UPLOAD_CLEANUP_QUEUE,
  UploadCleanupScheduler,
} from './infrastructure/upload-cleanup.scheduler';
import type { UploadCleanupConfig } from './infrastructure/upload-cleanup.scheduler';
import { UsageReconcileProcessor } from './infrastructure/usage-reconcile.processor';
import {
  USAGE_RECONCILE_CONFIG,
  USAGE_RECONCILE_QUEUE,
  UsageReconcileScheduler,
} from './infrastructure/usage-reconcile.scheduler';
import type { UsageReconcileConfig } from './infrastructure/usage-reconcile.scheduler';
import {
  SPACE_PROVIDERS,
  TRASH_LIFECYCLE_PROVIDERS,
  UPLOAD_LIFECYCLE_PROVIDERS,
} from './upload-lifecycle.providers';

/** Variables del `worker` que `storage` usa (plan §5); las de MinIO llegan por `MINIO_CONFIG`. */
export type StorageWorkerEnv = Pick<
  z.infer<typeof workerEnvSchema>,
  | 'UPLOAD_CLEANUP_INTERVAL_MINUTES'
  | 'UPLOAD_CLEANUP_BATCH_SIZE'
  | 'TRASH_PURGE_INTERVAL_MINUTES'
  | 'TRASH_PURGE_BATCH_SIZE'
  | 'USAGE_RECONCILE_INTERVAL_MINUTES'
  | 'USAGE_RECONCILE_BATCH_SIZE'
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

const folderConfigUnavailable = (): never => {
  throw new Error(
    'La configuración de carpetas no existe en el worker: solo purga la papelera. Crea, mueve o restaura desde el api.',
  );
};

/** `TrashService` pide `FOLDER_CONFIG`, pero el `worker` solo llama `purgeExpired`, que no la lee (plan 006 §7). */
const WORKER_FOLDER_CONFIG: FolderConfig = Object.freeze({
  get maxDepth(): number {
    return folderConfigUnavailable();
  },
});

/**
 * Parte de `storage` que corre en el `worker` (CA-9, D-6, ADR-0021): las colas `upload-cleanup`, `trash-purge`
 * (006 CA-19) y `usage-reconcile` (007 CA-13), sus programas repetibles y sus procesadores, que vencen cargas con
 * `UploadService.expire`, purgan la papelera con `TrashService.purgeExpired` y concilian `espacio_usado` con
 * `UsageReconciler`. Con `UPLOAD_LIFECYCLE_PROVIDERS` recibe también el registro y la poda de versiones (014), que
 * `UploadService` necesita. `apps/worker` la importa solo desde `storage/index.ts`.
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
    const purgeConfig: TrashPurgeConfig = {
      intervalMinutes: env.TRASH_PURGE_INTERVAL_MINUTES,
      batchSize: env.TRASH_PURGE_BATCH_SIZE,
    };
    const reconcileConfig: UsageReconcileConfig = {
      intervalMinutes: env.USAGE_RECONCILE_INTERVAL_MINUTES,
      batchSize: env.USAGE_RECONCILE_BATCH_SIZE,
    };
    return {
      module: StorageWorkerModule,
      imports: [
        AuditModule,
        BullModule.registerQueue(
          { name: UPLOAD_CLEANUP_QUEUE },
          { name: TRASH_PURGE_QUEUE },
          { name: USAGE_RECONCILE_QUEUE },
        ),
      ],
      providers: [
        { provide: UPLOAD_CLEANUP_CONFIG, useValue: cleanupConfig },
        { provide: TRASH_PURGE_CONFIG, useValue: purgeConfig },
        { provide: USAGE_RECONCILE_CONFIG, useValue: reconcileConfig },
        { provide: UPLOAD_CONFIG, useValue: WORKER_UPLOAD_CONFIG },
        { provide: FOLDER_CONFIG, useValue: WORKER_FOLDER_CONFIG },
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
        { provide: I_EXPIRED_TRASH_SCANNER, useClass: SqlExpiredTrashScanner },
        { provide: I_CLIENT_ACCOUNT_SCANNER, useClass: SqlClientAccountScanner },
        ...UPLOAD_LIFECYCLE_PROVIDERS,
        ...TRASH_LIFECYCLE_PROVIDERS,
        ...SPACE_PROVIDERS,
        UsageReconciler,
        UploadCleanupScheduler,
        UploadCleanupProcessor,
        TrashPurgeScheduler,
        TrashPurgeProcessor,
        UsageReconcileScheduler,
        UsageReconcileProcessor,
      ],
      // 009 (decisión 1): `invoice-retry` sube la factura PDF desde el `worker`.
      exports: [I_OBJECT_STORAGE],
    };
  }
}
