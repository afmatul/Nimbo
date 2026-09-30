import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { MINIO_CONFIG } from '../../shared';
import type { Env, MinioConfig } from '../../shared';
import { AuditModule } from '../audit';

import { FILE_SERVICE_CONFIG } from './application/file-service-config';
import type { FileServiceConfig } from './application/file-service-config';
import { FileService } from './application/file.service';
import { I_FILE_TYPE_DETECTOR } from './application/ports/i-file-type-detector.port';
import { I_NODE_REPOSITORY } from './application/ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './application/ports/i-object-storage.port';
import type { IObjectStorage } from './application/ports/i-object-storage.port';
import { I_QUOTA_REPOSITORY } from './application/ports/i-quota.repository.port';
import { I_UPLOAD_SESSION_REPOSITORY } from './application/ports/i-upload-session.repository.port';
import { QuotaService } from './application/quota.service';
import { UPLOAD_CONFIG } from './application/upload-config';
import type { UploadConfig } from './application/upload-config';
import { UploadRegistrar } from './application/upload-registrar';
import { UploadService } from './application/upload.service';
import { MagicBytesDetector } from './infrastructure/magic-bytes.detector';
import {
  buildMinioStorageClients,
  MinioStorageAdapter,
} from './infrastructure/minio-storage.adapter';
import { TypeOrmNodeRepository } from './infrastructure/persistence/typeorm-node.repository';
import { TypeOrmQuotaRepository } from './infrastructure/persistence/typeorm-quota.repository';
import { TypeOrmUploadSessionRepository } from './infrastructure/persistence/typeorm-upload-session.repository';
import { FilesController } from './presentation/files.controller';
import { UploadsController } from './presentation/uploads.controller';

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
        { provide: I_FILE_TYPE_DETECTOR, useClass: MagicBytesDetector },
        { provide: I_NODE_REPOSITORY, useClass: TypeOrmNodeRepository },
        { provide: I_UPLOAD_SESSION_REPOSITORY, useClass: TypeOrmUploadSessionRepository },
        { provide: I_QUOTA_REPOSITORY, useClass: TypeOrmQuotaRepository },
        QuotaService,
        UploadRegistrar,
        UploadService,
        FileService,
      ],
    };
  }
}
