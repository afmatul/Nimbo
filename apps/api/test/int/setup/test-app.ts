import type { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';

import {
  apiEnvSchema,
  CorrelationIdMiddleware,
  DomainExceptionFilter,
  EnvModule,
  loadEnv,
  MinioConfigModule,
  SharedModule,
  VersionHeaderMiddleware,
} from '../../../src/shared';
import type { Env } from '../../../src/shared';

import { createLogSinkModule, LogSink } from './log-sink';

export interface TestAppOptions {
  /** Módulos adicionales a `SharedModule` (p. ej. `HealthModule.forRoot(...)`). */
  readonly modules?: readonly (Type<unknown> | DynamicModule)[];
  /** Controladores de prueba definidos en el propio spec. */
  readonly controllers?: readonly Type<unknown>[];
  /** Variables que sustituyen a las del arnés (p. ej. contenedores propios de la suite). */
  readonly env?: Readonly<Record<string, string>>;
  /** Prefijo global; `api` usa `api/v1` (por defecto) y el `worker` ninguno. */
  readonly prefix?: string;
}

export interface TestApp {
  readonly app: INestApplication;
  readonly env: Env;
  readonly logs: LogSink;
  close(): Promise<void>;
}

export const TEST_VERSION = 'test';

/**
 * El arnés valida una sola vez, como `main.ts`: el contrato de `api` cubre también lo que usa el worker.
 * Es público para las suites que componen una raíz con `forRoot(env)` (p. ej. `WorkerModule`).
 */
export const buildTestEnv = (overrides: Readonly<Record<string, string>> = {}): Env => {
  const result = loadEnv(apiEnvSchema, { ...process.env, ...overrides });
  if (!result.ok) {
    throw new Error(`Entorno de pruebas inválido: ${result.issues.join('; ')}`);
  }
  return result.env;
};

/**
 * App de integración equivalente a `main.ts` (mismos middlewares y prefijo) con el logger capturado en memoria.
 * No escucha en un puerto: `supertest` habla con `app.getHttpServer()`.
 */
export const createTestApp = async (options: TestAppOptions = {}): Promise<TestApp> => {
  const env = buildTestEnv(options.env);
  const logs = new LogSink();

  const moduleRef = await Test.createTestingModule({
    imports: [
      createLogSinkModule(logs),
      EnvModule.forRoot(env),
      MinioConfigModule.forRoot(env),
      SharedModule,
      ...(options.modules ?? []),
    ],
    controllers: [...(options.controllers ?? [])],
  }).compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const correlation = new CorrelationIdMiddleware();
  const version = new VersionHeaderMiddleware(TEST_VERSION);
  app.use(correlation.use.bind(correlation));
  app.use(version.use.bind(version));
  app.setGlobalPrefix(options.prefix ?? 'api/v1');
  app.useGlobalFilters(new DomainExceptionFilter(logger));
  await app.init();

  return {
    app,
    env,
    logs,
    close: () => app.close(),
  };
};
