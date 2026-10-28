import type { Provider } from '@nestjs/common';

import { MINIO_CONFIG } from '../../shared';
import type { MinioConfig } from '../../shared';

import { I_OBJECT_STORAGE } from './application/ports/i-object-storage.port';
import type { IObjectStorage } from './application/ports/i-object-storage.port';
import { UPLOAD_CONFIG } from './application/upload-config';
import type { UploadConfig } from './application/upload-config';
import {
  buildMinioStorageClients,
  MinioStorageAdapter,
} from './infrastructure/minio-storage.adapter';
import { UPLOAD_LIFECYCLE_PROVIDERS } from './upload-lifecycle.providers';

const uploadConfigUnavailable = (): never => {
  throw new Error(
    'La configuración de carga no existe en el worker: solo vence cargas. Inicia, reanuda o completa desde el api.',
  );
};

/** Ningún proceso `worker` inicia cargas: `UploadService` está en el núcleo, pero su configuración no se usa allí. */
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
 * Núcleo de `storage` que comparten los dos procesos `worker` (ADR-0037): MinIO por el endpoint interno, repositorios,
 * cuota y versiones (`UPLOAD_LIFECYCLE_PROVIDERS`). Sin colas, programadores ni procesadores: esos los suma solo
 * `StorageWorkerModule`.
 */
export const WORKER_STORAGE_CORE_PROVIDERS: readonly Provider[] = [
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
  ...UPLOAD_LIFECYCLE_PROVIDERS,
];
