import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import {
  CorrelationContext,
  CorrelationIdMiddleware,
  loadDotenvFile,
  loadEnv,
  workerEnvSchema,
} from './shared';
import { WORKER_QUEUES, WorkerModule } from './worker.module';

/**
 * Arranque del `worker` (plan 000 §6.3): cargar el `.env` de la raíz si existe → validar entorno → `config.invalid` + exit 1 si falla → Nest con Pino →
 * escuchar en `WORKER_PORT` (nunca publicado, sin prefijo `/api/v1`: su salud no es API pública, CA-23).
 */
async function bootstrap(): Promise<void> {
  loadDotenvFile();
  const config = loadEnv(workerEnvSchema);
  if (!config.ok) {
    process.stderr.write(`${JSON.stringify({ event: 'config.invalid', issues: config.issues })}\n`);
    process.exit(1);
  }
  const env = config.env;

  const app = await NestFactory.create(WorkerModule.forRoot(env), { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Su salud interna también abre contexto de correlación (RNF-17): sin esto, una petición a
  // `/health/ready` del worker quedaría sin `correlationId` en la bitácora.
  // `VersionHeaderMiddleware` no se instala: `x-nimbo-version` es contrato de la API pública y
  // la salud del worker explícitamente no lo es (CA-23).
  const correlation = new CorrelationIdMiddleware();
  app.use(correlation.use.bind(correlation));

  await app.listen(env.WORKER_PORT);
  logger.log({
    event: 'worker.started',
    appEnv: env.APP_ENV,
    version: env.APP_VERSION,
    queues: [...WORKER_QUEUES],
  });
}

// El arranque también lleva `correlationId` (RNF-17): las líneas previas a la primera petición son rastreables.
void CorrelationContext.run({ correlationId: randomUUID() }, bootstrap);
