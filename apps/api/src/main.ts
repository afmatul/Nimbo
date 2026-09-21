import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import {
  apiEnvSchema,
  CorrelationContext,
  CorrelationIdMiddleware,
  DomainExceptionFilter,
  loadDotenvFile,
  loadEnv,
  VersionHeaderMiddleware,
} from './shared';

const API_PREFIX = 'api/v1';

/**
 * Arranque de `api` (plan 000 §6.2): cargar el `.env` de la raíz si existe → validar entorno → si falla, `config.invalid` en stderr y salir con `1`
 * (el logger aún no existe) → app con logger Pino → middlewares de correlación y versión → prefijo → filtro → escuchar.
 */
async function bootstrap(): Promise<void> {
  loadDotenvFile();
  const config = loadEnv(apiEnvSchema);
  if (!config.ok) {
    process.stderr.write(`${JSON.stringify({ event: 'config.invalid', issues: config.issues })}\n`);
    process.exit(1);
  }
  const env = config.env;

  const app = await NestFactory.create(AppModule.forRoot(env), { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const correlation = new CorrelationIdMiddleware();
  const version = new VersionHeaderMiddleware(env.APP_VERSION);
  app.use(correlation.use.bind(correlation));
  app.use(version.use.bind(version));
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new DomainExceptionFilter(logger));

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
