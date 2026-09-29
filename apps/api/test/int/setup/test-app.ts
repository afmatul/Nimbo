import type { DynamicModule, INestApplication, InjectionToken, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import type { z } from 'zod';

import {
  apiEnvSchema,
  configureHttpApp,
  EnvModule,
  loadEnv,
  MinioConfigModule,
  SharedModule,
  workerEnvSchema,
} from '../../../src/shared';
import type { Env } from '../../../src/shared';

import { createLogSinkModule, LogSink } from './log-sink';

type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Entorno de una app que compone módulos de `api` y del `worker` (001 CA-17, CA-18, CA-21). */
export type ApiWorkerEnv = Env & WorkerEnv;

/** Sustitución de un proveedor, p. ej. `{ provide: I_CLOCK, useValue: new FixedClock(...) }` (001 CA-1, CA-9). */
export interface ProviderOverride {
  readonly provide: InjectionToken;
  readonly useValue: unknown;
}

export interface TestEnvOptions {
  /** Valida también el contrato del `worker` (SMTP), con sus reglas, para componer sus módulos en la misma app. */
  readonly withWorkerEnv?: boolean;
}

export interface TestAppOptions extends TestEnvOptions {
  /** Módulos adicionales a `SharedModule` (p. ej. `HealthModule.forRoot(...)`). */
  readonly modules?: readonly (Type<unknown> | DynamicModule)[];
  /** Controladores de prueba definidos en el propio spec. */
  readonly controllers?: readonly Type<unknown>[];
  /** Variables que sustituyen a las del arnés (p. ej. contenedores propios de la suite). */
  readonly env?: Readonly<Record<string, string>>;
  /** Proveedores sustituidos en toda la app (`overrideProvider(...).useValue(...)`). */
  readonly overrides?: readonly ProviderOverride[];
  /** Sustituye el prefijo `api/v1` de `configureHttpApp`; el `worker` no usa ninguno (`''`). */
  readonly prefix?: string;
}

export interface TestApp {
  readonly app: INestApplication;
  readonly env: Env;
  readonly logs: LogSink;
  close(): Promise<void>;
}

export const TEST_VERSION = 'test';

const validate = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source: Readonly<Record<string, string | undefined>>,
): z.infer<TSchema> => {
  const result = loadEnv(schema, source);
  if (!result.ok) {
    throw new Error(`Entorno de pruebas inválido: ${result.issues.join('; ')}`);
  }
  return result.env;
};

/**
 * El arnés valida una sola vez, como `main.ts`. Con `withWorkerEnv` valida la misma fuente también con el esquema
 * del `worker` y une ambos resultados: cada proceso conserva sus reglas entre variables (`superRefine`, 001 T-10),
 * que la forma unida de los dos esquemas no tendría. Es público para las suites que componen una raíz con
 * `forRoot(env)` (p. ej. `WorkerModule`).
 */
export function buildTestEnv(
  overrides?: Readonly<Record<string, string>>,
  options?: { readonly withWorkerEnv?: false },
): Env;
export function buildTestEnv(
  overrides: Readonly<Record<string, string>>,
  options: { readonly withWorkerEnv: true },
): ApiWorkerEnv;
export function buildTestEnv(
  overrides: Readonly<Record<string, string>> = {},
  options: TestEnvOptions = {},
): Env | ApiWorkerEnv {
  const source = { ...process.env, APP_VERSION: TEST_VERSION, ...overrides };
  const apiEnv = validate(apiEnvSchema, source);
  return options.withWorkerEnv === true
    ? { ...validate(workerEnvSchema, source), ...apiEnv }
    : apiEnv;
}

/**
 * App de integración equivalente a `main.ts`: sin analizadores por defecto y con `configureHttpApp` (correlación,
 * versión, `trust proxy`, CORS, solo JSON, prefijo y filtro), con el logger capturado en memoria. Los módulos del
 * `worker` que se compongan escriben en el mismo `LogSink`. No escucha en un puerto: `supertest` habla con
 * `app.getHttpServer()`.
 */
export const createTestApp = async (options: TestAppOptions = {}): Promise<TestApp> => {
  const overrides = options.env ?? {};
  const env: Env =
    options.withWorkerEnv === true
      ? buildTestEnv(overrides, { withWorkerEnv: true })
      : buildTestEnv(overrides);
  const logs = new LogSink();

  const builder = Test.createTestingModule({
    imports: [
      createLogSinkModule(logs),
      EnvModule.forRoot(env),
      MinioConfigModule.forRoot(env),
      SharedModule,
      ...(options.modules ?? []),
    ],
    controllers: [...(options.controllers ?? [])],
  });
  const moduleRef = await (options.overrides ?? [])
    .reduce(
      (current, override) => current.overrideProvider(override.provide).useValue(override.useValue),
      builder,
    )
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  configureHttpApp(app, env);
  if (options.prefix !== undefined) {
    app.setGlobalPrefix(options.prefix);
  }
  await app.init();

  return {
    app,
    env,
    logs,
    close: () => app.close(),
  };
};
