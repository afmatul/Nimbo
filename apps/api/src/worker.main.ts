import { workerEnvSchema } from './shared';
import { startWorker } from './worker-bootstrap';
import { WORKER_QUEUES, WorkerModule } from './worker.module';

/** Arranque del `worker` general (plan 000 §6.3): escucha su salud interna en `WORKER_PORT`. */
void startWorker({
  name: 'worker',
  schema: workerEnvSchema,
  root: (env) => WorkerModule.forRoot(env),
  port: (env) => env.WORKER_PORT,
  queues: WORKER_QUEUES,
});
