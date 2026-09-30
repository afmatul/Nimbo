import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { MINIO_CONFIG } from '../../shared';
import type { Env, MinioConfig } from '../../shared';
import { AuditModule } from '../audit';

import { FILE_SERVICE_CONFIG } from './application/file-service-config';
import type { FileServiceConfig } from './application/file-service-config';
import { FileService } from './application/file.service';
import { I_OBJECT_STORAGE } from './application/ports/i-object-storage.port';
import type { IObjectStorage } from './application/ports/i-object-storage.port';
import { UPLOAD_CONFIG } from './application/upload-config';
import type { UploadConfig } from './application/upload-config';
import {
  buildMinioStorageClients,
  MinioStorageAdapter,
} from './infrastructure/minio-storage.adapter';
import { FilesController } from './presentation/files.controller';
import { UploadsController } from './presentation/uploads.controller';
import { UPLOAD_LIFECYCLE_PROVIDERS } from './upload-lifecycle.providers';

/** Variables del `api` que `storage` usa (plan §5); las de MinIO internas llegan por `MINIO_CONFIG`. */
export type StorageEnv = Pick<
  Env,
  | 'MINIO_PUBLIC_ENDPOINT'
  | 'UPLOAD_PART_SIZE_BYTES'
  | 'UPLOAD_MULTIPART_THRESHOLD_BYTES'
  | 'UPLOAD_URL_TTL_SECONDS'
  | 'RATE_LIMIT_UPLOAD_INIT_PER_MINUTE'
  | 'RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE'
>;

/**
 * Módulo `storage` (M2, plan §6): carga y descarga. `forRoot(env)` publica la configuración técnica (bytes como
 * `bigint`) y une cada puerto con su adaptador. **No** enlaza `I_PLAN_LIMITS_PROVIDER` ni importa `billing`: ese
 * enlace vive en la raíz de composición (DF-51, opción A). `SharedModule` (global) aporta reloj, tasa, transacciones y
 * `TransactionContext`; `MinioConfigModule` (global), `MINIO_CONFIG`.
 */
@Module({})
export class StorageModule {
  static forRoot(env: StorageEnv): DynamicModule {
    const uploadConfig: UploadConfig = {
      partSizeBytes: BigInt(env.UPLOAD_PART_SIZE_BYTES),
      multipartThresholdBytes: BigInt(env.UPLOAD_MULTIPART_THRESHOLD_BYTES),
      urlTtlSeconds: env.UPLOAD_URL_TTL_SECONDS,
      initPerMinute: env.RATE_LIMIT_UPLOAD_INIT_PER_MINUTE,
    };
    const fileServiceConfig: FileServiceConfig = {
      downloadUrlPerMinute: env.RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE,
    };
    return {
      module: StorageModule,
      imports: [AuditModule],
      controllers: [UploadsController, FilesController],
      providers: [
        { provide: UPLOAD_CONFIG, useValue: uploadConfig },
        { provide: FILE_SERVICE_CONFIG, useValue: fileServiceConfig },
        {
          provide: I_OBJECT_STORAGE,
          inject: [MINIO_CONFIG],
          useFactory: (config: MinioConfig): IObjectStorage =>
            new MinioStorageAdapter(
              buildMinioStorageClients(config, env.MINIO_PUBLIC_ENDPOINT),
              config.MINIO_BUCKET,
            ),
        },
        ...UPLOAD_LIFECYCLE_PROVIDERS,
        FileService,
      ],
    };
  }
}
