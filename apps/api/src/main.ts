import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureRealtime } from './modules/realtime';
import {
  apiEnvSchema,
  configureHttpApp,
  CorrelationContext,
  loadDotenvFile,
  loadEnv,
} from './shared';

/**
 * Arranque de `api` (plan 000 §6.2, plan 001 §6.8): cargar el `.env` de la raíz si existe → validar entorno → si falla,
 * `config.invalid` en stderr y salir con `1` (el logger aún no existe) → app con logger Pino y sin analizadores por
 * defecto → `configureHttpApp` (correlación, versión, `trust proxy`, CORS, solo JSON, prefijo y filtro) → canal en vivo
 * (`configureRealtime`, 015) → escuchar.
 */
async function bootstrap(): Promise<void> {
  loadDotenvFile();
  const config = loadEnv(apiEnvSchema);
  if (!config.ok) {
    process.stderr.write(`${JSON.stringify({ event: 'config.invalid', issues: config.issues })}\n`);
    process.exit(1);
  }
  const env = config.env;

  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    bufferLogs: true,
    bodyParser: false,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  configureHttpApp(app, env);
  configureRealtime(app);

  await app.listen(env.PORT);
  logger.log({
    event: 'api.started',
    port: env.PORT,
    appEnv: env.APP_ENV,
    version: env.APP_VERSION,
  });
}

// El arranque también lleva `correlationId` (RNF-17): las líneas previas a la primera petición son rastreables.
void CorrelationContext.run({ correlationId: randomUUID() }, bootstrap);
