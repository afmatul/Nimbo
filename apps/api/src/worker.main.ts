import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module';

const DEFAULT_WORKER_PORT = 3001;

/**
 * Bootstrap provisional del `worker` (T-06). Escucha en `WORKER_PORT` (nunca publicado) sin prefijo `/api/v1`
 * porque su salud no es API pública (spec 000 CA-23). T-22 agrega `loadEnv` y la bitácora `worker.started`.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  await app.listen(process.env['WORKER_PORT'] ?? DEFAULT_WORKER_PORT);
}

void bootstrap();
