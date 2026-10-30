import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { AuditModule } from '../audit';

import { OptimizableFileGateway } from './application/optimizable-file.gateway';
import { FILE_VERSION_PROVIDERS, OPTIMIZABLE_FILE_PROVIDERS } from './upload-lifecycle.providers';
import { WORKER_OBJECT_STORAGE_PROVIDER } from './worker-object-storage.provider';

/**
 * Fachadas de `storage` para un proceso `worker` que no hace mantenimiento de `storage` (ADR-0038): MinIO, la escritura de
 * versiones (`FILE_VERSION_PROVIDERS`) y la fachada del optimizador, sin el ciclo de carga y **sin** colas, programadores ni
 * procesadores (`upload-cleanup`, `trash-purge`,
 * `usage-reconcile` los consume solo el `worker` general con `StorageWorkerModule`). Lo importa `worker-optimizer`.
 */
@Module({})
export class StorageFacadesWorkerModule {
  static forRoot(): DynamicModule {
    return {
      module: StorageFacadesWorkerModule,
      imports: [AuditModule],
      providers: [
        WORKER_OBJECT_STORAGE_PROVIDER,
        ...FILE_VERSION_PROVIDERS,
        ...OPTIMIZABLE_FILE_PROVIDERS,
      ],
      exports: [OptimizableFileGateway],
    };
  }
}
