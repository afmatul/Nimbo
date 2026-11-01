import { workerOptimizerEnvSchema } from './shared';
import { startWorker } from './worker-bootstrap';
import { WORKER_OPTIMIZER_QUEUES, WorkerOptimizerModule } from './worker-optimizer.module';

/**
 * Arranque del `worker-optimizer` (ADR-0038): misma imagen que el `worker` general, otro comando; escucha su salud
 * interna en `WORKER_OPTIMIZER_PORT` y valida solo su propio entorno (PD-159).
 */
void startWorker({
  name: 'worker-optimizer',
  schema: workerOptimizerEnvSchema,
  root: (env) => WorkerOptimizerModule.forRoot(env),
  port: (env) => env.WORKER_OPTIMIZER_PORT,
  queues: WORKER_OPTIMIZER_QUEUES,
});
