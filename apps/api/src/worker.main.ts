import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { loadEnv, workerEnvSchema } from './shared';
import { WORKER_QUEUES, WorkerModule } from './worker.module';

/**
 * Arranque del `worker` (plan 000 §6.3): validar entorno → `config.invalid` + exit 1 si falla → Nest con Pino →
 * escuchar en `WORKER_PORT` (nunca publicado, sin prefijo `/api/v1`: su salud no es API pública, CA-23).
 */
async function bootstrap(): Promise<void> {
  const config = loadEnv(workerEnvSchema);
  if (!config.ok) {
    process.stderr.write(`${JSON.stringify({ event: 'config.invalid', issues: config.issues })}\n`);
    process.exit(1);
  }
  const env = config.env;

  const app = await NestFactory.create(WorkerModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  await app.listen(env.WORKER_PORT);
  logger.log({
    event: 'worker.started',
    appEnv: env.APP_ENV,
    version: env.APP_VERSION,
    queues: [...WORKER_QUEUES],
  });
}

void bootstrap();
