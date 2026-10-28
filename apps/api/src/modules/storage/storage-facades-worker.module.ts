import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { AuditModule } from '../audit';

import { OptimizableFileGateway } from './application/optimizable-file.gateway';
import { OPTIMIZABLE_FILE_PROVIDERS } from './upload-lifecycle.providers';
import { WORKER_STORAGE_CORE_PROVIDERS } from './worker-storage-core.providers';

/**
 * Fachadas de `storage` para un proceso `worker` que no hace mantenimiento de `storage` (ADR-0037): el núcleo y la
 * fachada del optimizador, **sin** colas, programadores ni procesadores (`upload-cleanup`, `trash-purge`,
 * `usage-reconcile` los consume solo el `worker` general con `StorageWorkerModule`). Lo importa `worker-optimizer`.
 */
@Module({})
export class StorageFacadesWorkerModule {
  static forRoot(): DynamicModule {
    return {
      module: StorageFacadesWorkerModule,
      imports: [AuditModule],
      providers: [...WORKER_STORAGE_CORE_PROVIDERS, ...OPTIMIZABLE_FILE_PROVIDERS],
      exports: [OptimizableFileGateway],
    };
  }
}
