import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  apiEnvObjectSchema,
  apiEnvSchema,
  LOCAL_JWT_ACCESS_SECRET,
  SECRET_KEYS,
  workerEnvObjectSchema,
} from './env.schema';
import { loadEnv } from './load-env';

const ENV_EXAMPLE = resolve(__dirname, '../../../../../../.env.example');
/** 32 bytes aleatorios en base64url: la forma del secreto en staging (plan 002 §6.10). */
const STAGING_SECRET = 'q3Vt1pZ8xN0cR4mW7yB2kE6hJ9sL5aD1fG3tY8uI0oP';

/** Mínimo válido para `api` (solo las variables sin valor por defecto). */
const API_ENV = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://nimbo:nimbo@localhost:5432/nimbo',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'nimbo',
  MINIO_SECRET_KEY: 'nimbo-secret',
  WEB_PUBLIC_URL: 'https://staging.nimbo.me',
  CORS_ORIGIN: 'https://staging.nimbo.me',
  JWT_ACCESS_SECRET: LOCAL_JWT_ACCESS_SECRET,
};

const declaredIn = (key: string): string[] =>
  [
    ['api', apiEnvObjectSchema.shape],
    ['worker', workerEnvObjectSchema.shape],
  ]
    .filter(([, shape]) => Object.hasOwn(shape as object, key))
    .map(([process]) => process as string);

describe('secretos por proceso (001 plan §6.10)', () => {
  it.each(SECRET_KEYS)('CA-18: la clave secreta `%s` se declara en `api` o en `worker`', (key) => {
    expect(declaredIn(key).length).toBeGreaterThan(0);
  });

  it('CA-18: un secreto que ningún proceso declara no pasa la comprobación', () => {
    expect(declaredIn('SECRETO_SIN_PROCESO')).toEqual([]);
  });

  it('CA-18: `SMTP_PASSWORD` es secreta y solo la declara el `worker`', () => {
    expect(SECRET_KEYS).toContain('SMTP_PASSWORD');
    expect(declaredIn('SMTP_PASSWORD')).toEqual(['worker']);
  });
});

describe('JWT_ACCESS_SECRET (002 plan §6.10, CA-25, CA-26)', () => {
  const issuesFor = (patch: Record<string, string | undefined>): readonly string[] => {
    const result = loadEnv(apiEnvSchema, { ...API_ENV, ...patch });
    return result.ok ? [] : result.issues;
  };

  it('CA-26: sin la variable, el `api` no arranca', () => {
    expect(issuesFor({ JWT_ACCESS_SECRET: undefined })).toEqual([
      '`JWT_ACCESS_SECRET` es obligatoria',
    ]);
  });

  it('CA-26: con menos de 32 caracteres falla, sin mostrar el valor', () => {
    const issues = issuesFor({ JWT_ACCESS_SECRET: 'x'.repeat(31) });

    expect(issues).toEqual(['`JWT_ACCESS_SECRET` debe tener al menos 32 caracteres']);
    expect(issues.join()).not.toContain('x'.repeat(31));
  });

  it('CA-26: en local basta el valor de desarrollo de `.env.example`', () => {
    expect(issuesFor({ APP_ENV: 'local' })).toEqual([]);
  });

  it.each(['staging', 'production'])(
    'CA-26: con `APP_ENV=%s` exige al menos 43 caracteres',
    (appEnv) => {
      expect(issuesFor({ APP_ENV: appEnv, JWT_ACCESS_SECRET: 'x'.repeat(42) })).toEqual([
        '`JWT_ACCESS_SECRET` debe tener al menos 43 caracteres en staging y en producción',
      ]);
    },
  );

  it.each(['staging', 'production'])(
    'CA-26: con `APP_ENV=%s` rechaza el valor de desarrollo de `.env.example`',
    (appEnv) => {
      expect(issuesFor({ APP_ENV: appEnv })).toEqual([
        '`JWT_ACCESS_SECRET` no puede ser el valor de desarrollo de .env.example',
      ]);
    },
  );

  it('CA-26: con `APP_ENV=staging` acepta 32 bytes aleatorios en base64url', () => {
    expect(issuesFor({ APP_ENV: 'staging', JWT_ACCESS_SECRET: STAGING_SECRET })).toEqual([]);
  });

  it('CA-26: el valor de desarrollo es el de `.env.example`', () => {
    const example = readFileSync(ENV_EXAMPLE, 'utf8');

    expect(example).toContain(`JWT_ACCESS_SECRET=${LOCAL_JWT_ACCESS_SECRET}
`);
  });

  it('CA-25: es secreta y solo la declara el `api`', () => {
    expect(SECRET_KEYS).toContain('JWT_ACCESS_SECRET');
    expect(declaredIn('JWT_ACCESS_SECRET')).toEqual(['api']);
  });
});
