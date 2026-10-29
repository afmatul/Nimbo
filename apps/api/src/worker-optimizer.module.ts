import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { OptimizerWorkerModule } from './modules/optimizer/worker';
import { StorageFacadesWorkerModule } from './modules/storage';
import { workerBaseImports } from './worker-base';
import type { WorkerOptimizerEnv } from './worker-base';

/**
 * Colas que consume el proceso `worker-optimizer` (ADR-0037); `worker.started` las lista. Disjuntas con
 * `WORKER_QUEUES`: cada cola tiene un solo consumidor. Literal, como en `WorkerModule`.
 */
export const WORKER_OPTIMIZER_QUEUES = ['optimization'] as const;

/**
 * Raíz de composición del proceso `worker-optimizer` (ADR-0037, plan 021 T-10): la base común de los `worker` y el
 * optimizador de imágenes (`OptimizerWorkerModule`, cola `optimization`, `sharp` solo aquí) sobre las fachadas de
 * `storage` sin mantenimiento (`StorageFacadesWorkerModule`). No compone correo, `ping`, `billing`, la indexación ni
 * los procesadores de `storage`: su memoria y sus fallos quedan aislados del `worker` general.
 */
@Module({})
export class WorkerOptimizerModule {
  static forRoot(env: WorkerOptimizerEnv): DynamicModule {
    return {
      module: WorkerOptimizerModule,
      imports: [
        ...workerBaseImports(env),
        OptimizerWorkerModule.forRoot(env, StorageFacadesWorkerModule.forRoot()),
      ],
    };
  }
}
