import type { Provider } from '@nestjs/common';

import { MINIO_CONFIG } from '../../shared';
import type { MinioConfig } from '../../shared';

import { I_OBJECT_STORAGE } from './application/ports/i-object-storage.port';
import type { IObjectStorage } from './application/ports/i-object-storage.port';
import {
  buildMinioStorageClients,
  MinioStorageAdapter,
} from './infrastructure/minio-storage.adapter';

/**
 * MinIO para los dos procesos `worker` (ADR-0037): firma contra el endpoint interno porque ninguno tiene
 * `MINIO_PUBLIC_ENDPOINT` ni emite URLs (plan 005 §5); solo leen, suben y borran objetos.
 */
export const WORKER_OBJECT_STORAGE_PROVIDER: Provider = {
  provide: I_OBJECT_STORAGE,
  inject: [MINIO_CONFIG],
  useFactory: (config: MinioConfig): IObjectStorage =>
    new MinioStorageAdapter(
      buildMinioStorageClients(config, config.MINIO_ENDPOINT),
      config.MINIO_BUCKET,
    ),
};
