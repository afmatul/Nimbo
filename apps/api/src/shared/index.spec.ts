import * as shared from './index';
import type { Actor, FieldIssue, IClock, IRateLimiter, ITransactionRunner } from './index';

/** Igualdad estricta de tipos (patrón de `type-challenges`); un fallo aquí lo detecta `pnpm typecheck`. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type _ActorHasExactlyTheDeclaredKeys = Expect<Equal<keyof Actor, 'id' | 'role' | 'canReadContent'>>;
type _ActorRoleIsRole = Expect<Equal<Actor['role'], shared.Role>>;
type _ActorFlagsContentAccess = Expect<Equal<Actor['canReadContent'], boolean>>;
type _ClockExposesOnlyNow = Expect<Equal<keyof IClock, 'now'>>;
type _FieldIssueHasExactlyTheDeclaredKeys = Expect<
  Equal<keyof FieldIssue, 'field' | 'reason' | 'message'>
>;
type _RateLimiterExposesOnlyConsume = Expect<Equal<keyof IRateLimiter, 'consume'>>;
type _TransactionRunnerExposesRunAndWithActor = Expect<
  Equal<keyof ITransactionRunner, 'run' | 'withActor'>
>;

/** Valores en tiempo de ejecución que `shared/index.ts` exporta al cerrar 000 (plan §6.2), por tarea. */
const RUNTIME_EXPORTS_BY_TASK = {
  'T-11': [
    'Role',
    'I_CLOCK',
    'SystemClock',
    'FixedClock',
    'DomainError',
    'InvalidInputError',
    'UnauthorizedError',
    'ForbiddenError',
    'NotFoundError',
    'ConflictError',
  ],
  'T-12': ['REDACTED_FIELDS', 'redactDeep'],
  'T-13': [
    'apiEnvSchema',
    'workerEnvSchema',
    'loadEnv',
    'loadDotenvFile',
    'formatEnvIssues',
    'ENV',
    'EnvModule',
    'MINIO_CONFIG',
    'MinioConfigModule',
  ],
  'T-14': ['CorrelationContext', 'CorrelationIdMiddleware', 'VersionHeaderMiddleware'],
  'T-15': ['buildDataSourceOptions'],
  'T-16': ['SharedModule'],
  'T-18': ['DomainExceptionFilter'],
  'T-19': ['HealthModule'],
  'T-20': ['PostgresHealthIndicator', 'RedisHealthIndicator', 'MinioHealthIndicator'],
  'T-21': ['enqueueWithCorrelation', 'PING_QUEUE', 'PingProcessor', 'PingQueue'],
  '001 T-16': [
    'TooManyRequestsError',
    'I_RATE_LIMITER',
    'I_TRANSACTION_RUNNER',
    'TransactionContext',
    'ZodValidationPipe',
    'REDIS_CLIENT',
  ],
  '001 T-17': ['configureHttpApp'],
  '003 T-03': ['createActor', 'ALL_ROLES'],
  '003 T-05': ['ACCESS_TOKEN_STRATEGY', 'I_ACCESS_TOKEN_VERIFIER'],
  '003 T-11': [
    'AuthGuardsModule',
    'Public',
    'IS_PUBLIC',
    'Roles',
    'ROLES_KEY',
    'CurrentActor',
    'CurrentSessionId',
    'UnauthenticatedError',
    'InsufficientRoleError',
  ],
  '005 T-25': ['BIGINT_TRANSFORMER'],
} as const;

const ALL_RUNTIME_EXPORTS: readonly string[] = Object.values(RUNTIME_EXPORTS_BY_TASK).flat();
const exportedKeys = (): string[] => Object.keys(shared).sort();
const expectExportsOf = (task: keyof typeof RUNTIME_EXPORTS_BY_TASK): void => {
  expect(exportedKeys()).toEqual(expect.arrayContaining([...RUNTIME_EXPORTS_BY_TASK[task]]));
};

describe('shared/index.ts (CA-17)', () => {
  it('CA-17: no exporta nada fuera de la lista del plan §6.2', () => {
    for (const key of exportedKeys()) {
      expect(ALL_RUNTIME_EXPORTS).toContain(key);
    }
  });

  it('CA-17: exporta `Role`, `I_CLOCK`, `SystemClock`, `FixedClock`, `DomainError` y sus subclases (T-11)', () => {
    expectExportsOf('T-11');
    expect(Object.values(shared.Role).sort()).toEqual(['ADMIN', 'CLIENT', 'OPERATOR', 'SUPPORT']);
    expect(typeof shared.I_CLOCK).toBe('symbol');
  });

  it('CA-17: `SystemClock` cumple `IClock` y devuelve la hora actual', () => {
    const clock: IClock = new shared.SystemClock();
    const before = Date.now();

    const now = clock.now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('CA-15: exporta `REDACTED_FIELDS` y `redactDeep` (T-12)', () => {
    expectExportsOf('T-12');
    expect(shared.REDACTED_FIELDS.has('password')).toBe(true);
    expect(shared.redactDeep({ token: 'x' })).toEqual({ token: '[REDACTED]' });
  });
  it('CA-18: exporta los esquemas, `loadEnv`, `formatEnvIssues` y los módulos de configuración (T-13)', () => {
    expectExportsOf('T-13');
    expect(shared.loadEnv(shared.workerEnvSchema, {})).toMatchObject({ ok: false });
    expect(typeof shared.EnvModule.forRoot).toBe('function');
    expect(typeof shared.MinioConfigModule.forRoot).toBe('function');
  });
  it('CA-13: exporta `CorrelationContext`, `CorrelationIdMiddleware` y `VersionHeaderMiddleware` (T-14)', () => {
    expectExportsOf('T-14');
    expect(shared.CorrelationContext.get()).toBeUndefined();
  });
  it('CA-10: exporta `buildDataSourceOptions` (T-15)', () => {
    expectExportsOf('T-15');
  });
  it('CA-18: exporta `SharedModule` (T-16)', () => {
    expectExportsOf('T-16');
  });
  it('CA-16: exporta `DomainExceptionFilter` (T-18)', () => {
    expectExportsOf('T-18');
  });
  it('CA-21: exporta `HealthModule` e `IHealthIndicator` (T-19)', () => {
    expectExportsOf('T-19');
    expect(typeof shared.HealthModule.forRoot).toBe('function');
  });
  it('CA-21: exporta `PostgresHealthIndicator`, `RedisHealthIndicator` y `MinioHealthIndicator` (T-20)', () => {
    expectExportsOf('T-20');
  });
  it('CA-14: exporta la cola `ping` completa: productor, consumidor y nombre (T-21)', () => {
    expectExportsOf('T-21');
    // Las dos raíces de composición registran la cola, así que el productor es API pública
    // del módulo y no un interno: importarlo por ruta rompería la frontera que vigila T-28.
    expect(shared.PING_QUEUE).toBe('ping');
  });
  it('001 CA-5/CA-15: exporta los errores, puertos y piezas nuevas de 001 (plan §6.7, T-16)', () => {
    expectExportsOf('001 T-16');
    expect(typeof shared.I_RATE_LIMITER).toBe('symbol');
    expect(typeof shared.I_TRANSACTION_RUNNER).toBe('symbol');
    expect(typeof shared.REDIS_CLIENT).toBe('symbol');
  });
  it('001 CA-6/CA-15: exporta `configureHttpApp`, la configuración HTTP común de `main.ts` y el arnés (T-17)', () => {
    expectExportsOf('001 T-17');
    expect(typeof shared.configureHttpApp).toBe('function');
  });
  it('CA-4: exporta `createActor` y `ALL_ROLES` (003 T-03)', () => {
    expectExportsOf('003 T-03');
    expect(shared.createActor('id', shared.Role.CLIENT).canReadContent).toBe(true);
  });
  it('CA-2: exporta el puerto `IAccessTokenVerifier` y el nombre de la estrategia (003 T-05)', () => {
    expectExportsOf('003 T-05');
    expect(shared.ACCESS_TOKEN_STRATEGY).toBe('jwt');
    expect(typeof shared.I_ACCESS_TOKEN_VERIFIER).toBe('symbol');
  });
  it('CA-1: exporta los guards globales, los decoradores y los errores de autorización (003 T-11)', () => {
    expectExportsOf('003 T-11');
    expect(new shared.UnauthenticatedError().status).toBe(401);
    expect(new shared.InsufficientRoleError().status).toBe(403);
  });
  it('RN-11: exporta `BIGINT_TRANSFORMER` para las columnas de bytes de cualquier módulo (005 T-25)', () => {
    expectExportsOf('005 T-25');
    expect(shared.BIGINT_TRANSFORMER.from('1')).toBe(1n);
  });
  it('CA-17: exporta exactamente la lista del plan §6.2 al cerrar el bloque 2 (T-26)', () => {
    expect(exportedKeys()).toEqual([...ALL_RUNTIME_EXPORTS].sort());
  });
});
