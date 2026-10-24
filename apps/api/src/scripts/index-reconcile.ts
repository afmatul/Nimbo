import { randomUUID } from 'node:crypto';

import { Queue } from 'bullmq';
import type { RedisOptions } from 'bullmq';

import { INDEX_RECONCILE_QUEUE, requestIndexReconcile } from '../modules/intelligence';
import { errorClassOf, loadDotenvFile, loadEnv } from '../shared';
import { workerEnvObjectSchema } from '../shared/infrastructure/config/env.schema';
import { buildBullConnection } from '../shared/infrastructure/queue/bull.config';

/** Solo hace falta Redis: el trabajo lo corre el `worker` con su propio entorno. */
const requestEnvSchema = workerEnvObjectSchema.pick({ REDIS_URL: true });

/**
 * Sin reconexión: con Redis caído el comando falla en lugar de quedarse esperando (la conexión de BullMQ reintenta para
 * siempre, como necesita un `Worker`).
 */
const connectionTo = (redisUrl: string): RedisOptions => ({
  ...(buildBullConnection(redisUrl) as RedisOptions),
  retryStrategy: () => null,
});

const writeLine = (stream: NodeJS.WriteStream, payload: Record<string, unknown>): void => {
  stream.write(`${JSON.stringify(payload)}\n`);
};

/**
 * Tarea administrativa del Operador (019 RN-12, CA-23): `pnpm --filter api index:reconcile` deja **un** trabajo en
 * `index-reconcile`, el mismo que el `worker` programa cada `INDEX_RECONCILE_INTERVAL_MINUTES`, y termina. El
 * resultado (`index.reconcile_completed`, con conteos e ids) queda en la bitácora del `worker` con este
 * `correlationId`. Nunca imprime `REDIS_URL`.
 */
async function main(): Promise<void> {
  loadDotenvFile();
  const config = loadEnv(requestEnvSchema);
  if (!config.ok) {
    writeLine(process.stderr, { event: 'config.invalid', issues: config.issues });
    process.exit(1);
  }
  const queue = new Queue(INDEX_RECONCILE_QUEUE, {
    connection: connectionTo(config.env.REDIS_URL),
  });
  // El fallo llega por el rechazo de `add`; el evento solo evita que ioredis vuelque el error (y la dirección) a la consola.
  queue.on('error', () => undefined);
  const correlationId = randomUUID();
  try {
    await requestIndexReconcile(queue, correlationId);
    writeLine(process.stdout, { event: 'index.reconcile_requested', correlationId });
  } finally {
    await queue.close();
  }
}

main().catch((error: unknown) => {
  writeLine(process.stderr, {
    event: 'index.reconcile_request_failed',
    errorClass: errorClassOf(error),
  });
  process.exit(1);
});
