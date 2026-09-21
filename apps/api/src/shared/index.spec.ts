import * as shared from './index';
import type { Actor, IClock } from './index';

/** Igualdad estricta de tipos (patrón de `type-challenges`); un fallo aquí lo detecta `pnpm typecheck`. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type _ActorHasExactlyTheDeclaredKeys = Expect<Equal<keyof Actor, 'id' | 'role' | 'canReadContent'>>;
type _ActorRoleIsRole = Expect<Equal<Actor['role'], shared.Role>>;
type _ActorFlagsContentAccess = Expect<Equal<Actor['canReadContent'], boolean>>;
type _ClockExposesOnlyNow = Expect<Equal<keyof IClock, 'now'>>;

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
  'T-21': ['enqueueWithCorrelation', 'PingProcessor'],
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
  it('CA-14: exporta `enqueueWithCorrelation` y `PingProcessor`; no `PingQueue` (T-21)', () => {
    expectExportsOf('T-21');
    expect(exportedKeys()).not.toContain('PingQueue');
  });
  it('CA-17: exporta exactamente la lista del plan §6.2 al cerrar el bloque 2 (T-26)', () => {
    expect(exportedKeys()).toEqual([...ALL_RUNTIME_EXPORTS].sort());
  });
});
