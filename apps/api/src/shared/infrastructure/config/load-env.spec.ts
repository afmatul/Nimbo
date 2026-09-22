import { apiEnvSchema, SECRET_KEYS, workerEnvSchema } from './env.schema';
import { loadEnv } from './load-env';

/** Mínimo válido para `api`: solo las variables sin valor por defecto. */
const VALID_API = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://nimbo:nimbo@localhost:5432/nimbo',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'nimbo',
  MINIO_SECRET_KEY: 'nimbo-secret',
};

const SECRET_VALUE = 'valor-secreto-que-no-debe-aparecer';

describe('loadEnv(apiEnvSchema)', () => {
  it('CA-18: falta `DATABASE_URL` → issue que nombra la variable y el motivo', () => {
    const { DATABASE_URL: _omitted, ...source } = VALID_API;

    const result = loadEnv(apiEnvSchema, source);

    expect(result).toEqual({ ok: false, issues: ['`DATABASE_URL` es obligatoria'] });
  });

  it('CA-18: `PORT=abc` → «`PORT` debe ser un entero entre 1 y 65535»', () => {
    const result = loadEnv(apiEnvSchema, { ...VALID_API, PORT: 'abc' });

    expect(result).toEqual({ ok: false, issues: ['`PORT` debe ser un entero entre 1 y 65535'] });
  });

  it('CA-18: `PORT=70000` y `WORKER_PORT=0` también se rechazan con el mismo motivo', () => {
    const result = loadEnv(apiEnvSchema, { ...VALID_API, PORT: '70000', WORKER_PORT: '0' });

    expect(result).toEqual({
      ok: false,
      issues: [
        '`WORKER_PORT` debe ser un entero entre 1 y 65535',
        '`PORT` debe ser un entero entre 1 y 65535',
      ],
    });
  });

  it('CA-18: varios errores → todos en una sola lista', () => {
    const result = loadEnv(apiEnvSchema, {
      NODE_ENV: 'prod',
      APP_ENV: 'test',
      LOG_LEVEL: 'verbose',
      DATABASE_URL: 'no-es-url',
      REDIS_URL: 'redis://localhost:6379',
      MINIO_ENDPOINT: 'http://localhost:9000',
      MINIO_ACCESS_KEY: '',
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        '`NODE_ENV` debe ser uno de: development, test, production',
        '`LOG_LEVEL` debe ser uno de: trace, debug, info, warn, error, fatal',
        '`DATABASE_URL` debe ser una URL válida',
        '`MINIO_ACCESS_KEY` no puede estar vacía',
        '`MINIO_SECRET_KEY` es obligatoria',
      ],
    });
  });

  it('CA-18: entorno válido → `env` tipado con los valores por defecto del plan', () => {
    const result = loadEnv(apiEnvSchema, VALID_API);

    expect(result).toEqual({
      ok: true,
      env: {
        ...VALID_API,
        APP_VERSION: 'dev',
        PORT: 3000,
        WORKER_PORT: 3001,
        MINIO_BUCKET: 'nimbo',
        MINIO_REGION: 'us-east-1',
      },
    });
  });

  it('CA-18: los valores explícitos ganan a los defaults y `PORT` llega como número', () => {
    const result = loadEnv(apiEnvSchema, {
      ...VALID_API,
      PORT: '8080',
      APP_VERSION: 'sha-abc1234',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.PORT).toBe(8080);
    expect(result.env.APP_VERSION).toBe('sha-abc1234');
  });

  it('CA-18: ignora variables ajenas al esquema (el `process.env` real trae muchas más)', () => {
    const result = loadEnv(apiEnvSchema, { ...VALID_API, PATH: '/usr/bin', HOME: '/home/nimbo' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env).not.toHaveProperty('PATH');
  });

  it('CA-18: el texto de las issues nunca contiene el valor de `MINIO_SECRET_KEY` ni de otras variables', () => {
    const result = loadEnv(apiEnvSchema, {
      NODE_ENV: SECRET_VALUE,
      APP_ENV: SECRET_VALUE,
      LOG_LEVEL: SECRET_VALUE,
      PORT: SECRET_VALUE,
      DATABASE_URL: SECRET_VALUE,
      REDIS_URL: SECRET_VALUE,
      MINIO_ENDPOINT: SECRET_VALUE,
      MINIO_ACCESS_KEY: '',
      MINIO_SECRET_KEY: '',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThanOrEqual(8);
    expect(result.issues.join('\n')).not.toContain(SECRET_VALUE);
  });

  it('CA-18: no lee `process.env` cuando se le pasa una fuente explícita', () => {
    process.env.DATABASE_URL = 'postgres://desde-process-env';

    const { DATABASE_URL: _omitted, ...source } = VALID_API;
    const result = loadEnv(apiEnvSchema, source);

    delete process.env.DATABASE_URL;
    expect(result).toEqual({ ok: false, issues: ['`DATABASE_URL` es obligatoria'] });
  });
});

describe('loadEnv(workerEnvSchema)', () => {
  it('CA-18: `workerEnvSchema` no exige `MINIO_*` ni `PORT`', () => {
    const { MINIO_ENDPOINT: _e, MINIO_ACCESS_KEY: _a, MINIO_SECRET_KEY: _s, ...source } = VALID_API;

    const result = loadEnv(workerEnvSchema, source);

    expect(result).toEqual({
      ok: true,
      env: {
        NODE_ENV: 'test',
        APP_ENV: 'test',
        APP_VERSION: 'dev',
        WORKER_PORT: 3001,
        LOG_LEVEL: 'info',
        DATABASE_URL: VALID_API.DATABASE_URL,
        REDIS_URL: VALID_API.REDIS_URL,
      },
    });
  });

  it('CA-18: el worker sí exige `REDIS_URL`', () => {
    const result = loadEnv(workerEnvSchema, {
      NODE_ENV: 'test',
      APP_ENV: 'test',
      LOG_LEVEL: 'info',
    });

    expect(result).toEqual({
      ok: false,
      issues: ['`DATABASE_URL` es obligatoria', '`REDIS_URL` es obligatoria'],
    });
  });
});

describe('SECRET_KEYS', () => {
  it('CA-18: las claves secretas del esquema son exactamente las de `config/secret-keys.ts`', () => {
    expect([...SECRET_KEYS]).toEqual(['MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY']);
    for (const key of SECRET_KEYS) {
      expect(apiEnvSchema.shape).toHaveProperty(key);
    }
  });
});
