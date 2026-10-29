import { randomUUID } from 'node:crypto';

import type { DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { z } from 'zod';

import {
  CorrelationContext,
  CorrelationIdMiddleware,
  errorClassOf,
  loadDotenvFile,
  loadEnv,
} from './shared';
import type { WorkerBaseEnv } from './worker-base';

type WorkerName = 'worker' | 'worker-optimizer';

/**
 * Lo que distingue a un proceso `worker` de otro (ADR-0037): su nombre, el esquema de su entorno (PD-135: cada uno
 * valida solo lo que lee), su raíz, su puerto interno y sus colas.
 */
export interface WorkerProcess<TEnv extends WorkerBaseEnv> {
  readonly name: WorkerName;
  readonly schema: z.ZodType<TEnv, z.ZodTypeDef, unknown>;
  readonly root: (env: TEnv) => DynamicModule;
  readonly port: (env: TEnv) => number;
  readonly queues: readonly string[];
}

/** Valida el entorno o termina con una sola línea `config.invalid` y exit 1 (CA-18). */
const loadWorkerEnv = <TEnv extends WorkerBaseEnv>(
  schema: z.ZodType<TEnv, z.ZodTypeDef, unknown>,
): TEnv => {
  loadDotenvFile();
  const config = loadEnv(schema);
  if (!config.ok) {
    process.stderr.write(`${JSON.stringify({ event: 'config.invalid', issues: config.issues })}\n`);
    process.exit(1);
  }
  return config.env;
};

const bootstrap = async <TEnv extends WorkerBaseEnv>(
  worker: WorkerProcess<TEnv>,
): Promise<void> => {
  const env = loadWorkerEnv(worker.schema);
  // `abortOnError: false`: un error de arranque rechaza y lo registra `startWorker`, en vez de `process.abort()`.
  const app = await NestFactory.create(worker.root(env), { bufferLogs: true, abortOnError: false });
  const logger = app.get(Logger);
  app.useLogger(logger);
  // SIGTERM/SIGINT cierran Nest: `@nestjs/bullmq` cierra cada `Worker` esperando el trabajo activo (I-3, ADR-0037).
  app.enableShutdownHooks();

  // Su salud interna también abre contexto de correlación (RNF-17): sin esto, una petición a
  // `/health/ready` del worker quedaría sin `correlationId` en la bitácora.
  // `VersionHeaderMiddleware` no se instala: `x-nimbo-version` es contrato de la API pública y
  // la salud del worker explícitamente no lo es (CA-23).
  const correlation = new CorrelationIdMiddleware();
  app.use(correlation.use.bind(correlation));

  await app.listen(worker.port(env));
  logger.log({
    event: 'worker.started',
    process: worker.name,
    appEnv: env.APP_ENV,
    version: env.APP_VERSION,
    queues: [...worker.queues],
  });
};

/**
 * Un arranque fallido (base de datos o Redis inalcanzables, un proveedor que no resuelve) deja una sola línea JSON con
 * el proceso y la clase del error, nunca su mensaje (puede llevar URLs con credenciales), y sale con 1. Sale de forma
 * explícita, después de escribir la línea: las conexiones que alcanzaron a abrirse (Redis, BullMQ) mantendrían vivo el
 * proceso y compose nunca lo reiniciaría.
 */
export const reportStartFailure = (name: WorkerName, error: unknown): void => {
  const line = { event: 'worker.start_failed', process: name, errorClass: errorClassOf(error) };
  process.stderr.write(`${JSON.stringify(line)}\n`, () => process.exit(1));
};

/**
 * Arranque común de los procesos `worker` (plan 000 §6.3, ADR-0037): cargar el `.env` de la raíz si existe → validar
 * su entorno → `config.invalid` + exit 1 si falla → Nest con Pino y cierre ordenado → escuchar en su puerto interno
 * (nunca publicado, sin prefijo `/api/v1`: su salud no es API pública, CA-23). El arranque también lleva
 * `correlationId` (RNF-17).
 */
export const startWorker = <TEnv extends WorkerBaseEnv>(
  worker: WorkerProcess<TEnv>,
): Promise<void> =>
  CorrelationContext.run({ correlationId: randomUUID() }, () => bootstrap(worker)).catch(
    (error: unknown) => reportStartFailure(worker.name, error),
  );
