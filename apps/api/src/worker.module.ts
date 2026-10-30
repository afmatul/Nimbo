import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { BillingWorkerModule } from './modules/billing';
import { IntelligenceWorkerModule } from './modules/intelligence';
import { MAIL_QUEUE, NotificationsWorkerModule } from './modules/notifications';
import { StorageWorkerModule } from './modules/storage';
import { PING_QUEUE, PingProcessor } from './shared';
import { workerBaseImports } from './worker-base';
import type { WorkerEnv } from './worker-base';

/**
 * Colas que este proceso consume; `worker.started` las lista (plan 000 §7). `upload-cleanup`, `trash-purge`,
 * `usage-reconcile`, `subscription-reconcile`, `invoice-retry`, `subscription-renewal`, `indexing` e `index-reconcile` se escriben literales: el `worker` importa de `storage`,
 * `billing` e `intelligence` solo sus módulos del `worker` (plan 005 §3b, plan 009 §2, plan 019 §2) y `worker.module.spec.ts` fija
 * los nombres. `index-status` no está: el `worker` solo la llena y la consume el `api` (019 D-2). `optimization` tampoco:
 * la consume solo el proceso `worker-optimizer` (ADR-0038).
 */
export const WORKER_QUEUES = [
  PING_QUEUE,
  MAIL_QUEUE,
  'upload-cleanup',
  'trash-purge',
  'usage-reconcile',
  'subscription-reconcile',
  'invoice-retry',
  'subscription-renewal',
  'indexing',
  'index-reconcile',
] as const;

/**
 * Raíz de composición del proceso `worker` (plan 000 §6.3, alternativa R-3): compone módulos de `api`,
 * no aloja lógica propia. Sobre la base común (`workerBaseImports`: entorno, `SharedModule`, MinIO, salud solo con
 * Redis, eventos en proceso y el enlace de `I_PLAN_LIMITS_PROVIDER`), consume `ping` y `mail` (001 plan §6.8) y el barrido de
 * cargas vencidas (005 D-6), la purga de la papelera (006) y la conciliación de espacio (007) de `storage`, y la
 * conciliación de suscripciones y el reintento de facturas sin PDF o sin aviso (`invoice-retry`) de `billing` (009).
 * Los eventos en proceso (ADR-0019) los pide `FileVersionService`, que `storage` comparte con el `api` y que desde 019
 * anuncia cada versión vigente (RN-11); en el `worker` aún nadie registra versiones ni escucha (plan 019 §7 punto 7).
 * La indexación de 019 (cola `indexing`; avisos a `index-status`) y su conciliación (`index-reconcile`, RN-12) las monta
 * `IntelligenceWorkerModule` con la misma `storage`. El optimizador de imágenes (021) **no** está aquí: corre en su
 * propio proceso, `worker-optimizer` (ADR-0038), y esta raíz nunca carga `sharp`.
 */
@Module({})
export class WorkerModule {
  static forRoot(env: WorkerEnv): DynamicModule {
    // Una sola instancia de `storage` en el `worker`: `billing` la recibe para subir el PDF (009 T-07).
    const storage = StorageWorkerModule.forRoot(env);
    return {
      module: WorkerModule,
      imports: [
        ...workerBaseImports(env),
        BullModule.registerQueue({ name: PING_QUEUE }),
        NotificationsWorkerModule,
        storage,
        BillingWorkerModule.forRoot(env, storage),
        IntelligenceWorkerModule.forRoot(env, storage),
      ],
      providers: [PingProcessor],
    };
  }
}
