import type {
  DynamicModule,
  INestApplication,
  INestApplicationContext,
  InjectionToken,
  Type,
} from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import type { z } from 'zod';

import {
  ACCESS_TOKEN_STRATEGY,
  apiEnvSchema,
  AuthGuardsModule,
  configureHttpApp,
  EnvModule,
  loadEnv,
  MinioConfigModule,
  SharedModule,
  workerEnvSchema,
} from '../../../src/shared';
import type { Env } from '../../../src/shared';
import { ProbeModule } from '../../support/probe.module';

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
  /**
   * Entorno ya validado con `buildTestEnv(...)`, para que la app use **el mismo** objeto que recibe una raíz con
   * `forRoot(env)` (p. ej. `AppModule`). Si se da, `env` y `withWorkerEnv` no se usan.
   */
  readonly validatedEnv?: Env;
  /** Proveedores sustituidos en toda la app (`overrideProvider(...).useValue(...)`). */
  readonly overrides?: readonly ProviderOverride[];
  /** Sustituye el prefijo `api/v1` de `configureHttpApp`; el `worker` no usa ninguno (`''`). */
  readonly prefix?: string;
  /**
   * Quién registra la estrategia `ACCESS_TOKEN_STRATEGY`: `'test'` (por defecto) monta `ProbeModule` con
   * `TestJwtStrategy`; `'identity'` no monta nada y usa la real de `IdentityModule` (002).
   */
  readonly accessTokenStrategy?: 'test' | 'identity';
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

/** Instancias de estrategia de Passport con el nombre `ACCESS_TOKEN_STRATEGY` en el árbol compilado. */
export const accessTokenStrategiesIn = (
  moduleRef: Pick<INestApplicationContext, 'get'>,
): number => {
  let count = 0;
  for (const module of moduleRef.get(ModulesContainer).values()) {
    for (const wrapper of module.providers.values()) {
      const instance = wrapper.instance as { name?: unknown; authenticate?: unknown } | undefined;
      if (typeof instance?.authenticate === 'function' && instance.name === ACCESS_TOKEN_STRATEGY) {
        count += 1;
      }
    }
  }
  return count;
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

const envFor = (options: TestAppOptions): Env => {
  const overrides = options.env ?? {};
  return options.withWorkerEnv === true
    ? buildTestEnv(overrides, { withWorkerEnv: true })
    : buildTestEnv(overrides);
};

/**
 * App de integración equivalente a `main.ts`: sin analizadores por defecto y con `configureHttpApp` (correlación,
 * versión, `trust proxy`, CORS, solo JSON, prefijo y filtro), con el logger capturado en memoria. Los módulos del
 * `worker` que se compongan escriben en el mismo `LogSink`. No escucha en un puerto: `supertest` habla con
 * `app.getHttpServer()`.
 *
 * Autorización (003 §6.6): los guards globales (`AuthGuardsModule`) están **siempre** activos; no hay opción para
 * apagarlos, así que una ruta sin `@Public()` ni `@Roles(...)` falla en la prueba. **Regla de una sola estrategia**:
 * `passport.use` es un registro por proceso y la última estrategia con el mismo nombre gana, así que una app de prueba
 * registra una sola `ACCESS_TOKEN_STRATEGY`. Con `accessTokenStrategy: 'test'` la aporta `ProbeModule`, y si el árbol
 * trae otra (p. ej. `IdentityModule` desde 002), `createTestApp` lanza; esas suites usan `'identity'`.
 */
export const createTestApp = async (options: TestAppOptions = {}): Promise<TestApp> => {
  const env = options.validatedEnv ?? envFor(options);
  const logs = new LogSink();
  const usesTestStrategy = (options.accessTokenStrategy ?? 'test') === 'test';

  const builder = Test.createTestingModule({
    imports: [
      createLogSinkModule(logs),
      EnvModule.forRoot(env),
      MinioConfigModule.forRoot(env),
      SharedModule,
      AuthGuardsModule,
      ...(usesTestStrategy ? [ProbeModule] : []),
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
  if (usesTestStrategy && accessTokenStrategiesIn(moduleRef) > 1) {
    await moduleRef.close();
    throw new Error(
      `createTestApp: una app de prueba registra una sola estrategia "${ACCESS_TOKEN_STRATEGY}". Con ` +
        `accessTokenStrategy: 'test' el árbol no puede traer otra (p. ej. IdentityModule); usa 'identity'.`,
    );
  }

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  configureHttpApp(app, env);
  if (options.prefix !== undefined) {
    app.setGlobalPrefix(options.prefix);
  }
  try {
    await app.init();
  } catch (error: unknown) {
    // Un arranque rechazado (p. ej. `DatabaseRoleCheck` con el dueño) no deja conexiones abiertas en la suite; si el
    // cierre también falla, se relanza el error original y no el del cierre.
    await app.close().catch(() => undefined);
    throw error;
  }

  return {
    app,
    env,
    logs,
    close: () => app.close(),
  };
};
