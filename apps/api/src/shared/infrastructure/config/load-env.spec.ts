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
  WEB_PUBLIC_URL: 'http://localhost',
  CORS_ORIGIN: 'http://localhost,http://localhost:3002',
};

/** Mínimo válido para `worker`: el contrato común y el SMTP de Mailpit (001 plan §6.10). */
const VALID_WORKER = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://nimbo:nimbo@localhost:5432/nimbo',
  REDIS_URL: 'redis://localhost:6379',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_TLS: 'none',
  MAIL_FROM: 'Nimbo <no-responder@nimbo.me>',
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
        '`WEB_PUBLIC_URL` es obligatoria',
        '`CORS_ORIGIN` es obligatoria',
      ],
    });
  });

  it('CA-18: entorno válido → `env` tipado con los valores por defecto del plan', () => {
    const result = loadEnv(apiEnvSchema, VALID_API);

    expect(result).toEqual({
      ok: true,
      env: {
        ...VALID_API,
        CORS_ORIGIN: ['http://localhost', 'http://localhost:3002'],
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
  it('CA-18: `workerEnvSchema` no exige `MINIO_*`, `PORT`, `WEB_PUBLIC_URL` ni `CORS_ORIGIN`', () => {
    const result = loadEnv(workerEnvSchema, VALID_WORKER);

    expect(result).toEqual({
      ok: true,
      env: {
        NODE_ENV: 'test',
        APP_ENV: 'test',
        APP_VERSION: 'dev',
        WORKER_PORT: 3001,
        LOG_LEVEL: 'info',
        DATABASE_URL: VALID_WORKER.DATABASE_URL,
        REDIS_URL: VALID_WORKER.REDIS_URL,
        SMTP_HOST: 'localhost',
        SMTP_PORT: 1025,
        SMTP_TLS: 'none',
        MAIL_FROM: VALID_WORKER.MAIL_FROM,
      },
    });
  });

  it('CA-18: el worker exige `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS` y `MAIL_FROM`', () => {
    const { SMTP_HOST: _h, SMTP_PORT: _p, SMTP_TLS: _t, MAIL_FROM: _f, ...source } = VALID_WORKER;

    const result = loadEnv(workerEnvSchema, source);

    expect(result).toEqual({
      ok: false,
      issues: [
        '`SMTP_HOST` es obligatoria',
        '`SMTP_PORT` es obligatoria',
        '`SMTP_TLS` es obligatoria',
        '`MAIL_FROM` es obligatoria',
      ],
    });
  });

  it('CA-18: `SMTP_TLS` solo admite `none`, `starttls` o `implicit`', () => {
    const result = loadEnv(workerEnvSchema, { ...VALID_WORKER, SMTP_TLS: 'ssl' });

    expect(result).toEqual({
      ok: false,
      issues: ['`SMTP_TLS` debe ser uno de: none, starttls, implicit'],
    });
  });

  it('CA-20: `SMTP_TLS=none` con `APP_ENV=staging` falla', () => {
    const result = loadEnv(workerEnvSchema, { ...VALID_WORKER, APP_ENV: 'staging' });

    expect(result).toEqual({
      ok: false,
      issues: ['`SMTP_TLS` no puede ser `none` en staging ni en producción'],
    });
  });

  it('CA-20: `SMTP_TLS=implicit` con `APP_ENV=staging` es válido', () => {
    const result = loadEnv(workerEnvSchema, {
      ...VALID_WORKER,
      APP_ENV: 'staging',
      SMTP_TLS: 'implicit',
    });

    expect(result.ok).toBe(true);
  });

  it('CA-18: `SMTP_PASSWORD` sin `SMTP_USER` falla sin mostrar la clave', () => {
    const result = loadEnv(workerEnvSchema, { ...VALID_WORKER, SMTP_PASSWORD: SECRET_VALUE });

    expect(result).toEqual({
      ok: false,
      issues: ['`SMTP_USER` es obligatoria si se define `SMTP_PASSWORD`'],
    });
  });

  it('CA-18: `SMTP_USER` y `SMTP_PASSWORD` vacías (como en `.env.example`) cuentan como ausentes', () => {
    const result = loadEnv(workerEnvSchema, { ...VALID_WORKER, SMTP_USER: '', SMTP_PASSWORD: '' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.SMTP_USER).toBeUndefined();
    expect(result.env.SMTP_PASSWORD).toBeUndefined();
  });

  it('CA-18: con `SMTP_USER` y `SMTP_PASSWORD` el worker las recibe', () => {
    const result = loadEnv(workerEnvSchema, {
      ...VALID_WORKER,
      SMTP_USER: 'resend',
      SMTP_PASSWORD: SECRET_VALUE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.SMTP_USER).toBe('resend');
    expect(result.env.SMTP_PASSWORD).toBe(SECRET_VALUE);
  });

  it('CA-18: el worker sí exige `REDIS_URL`', () => {
    const { DATABASE_URL: _d, REDIS_URL: _r, ...source } = VALID_WORKER;

    const result = loadEnv(workerEnvSchema, source);

    expect(result).toEqual({
      ok: false,
      issues: ['`DATABASE_URL` es obligatoria', '`REDIS_URL` es obligatoria'],
    });
  });
});

describe('loadEnv(apiEnvSchema): variables de 001 (plan §6.10)', () => {
  it('CA-6: `CORS_ORIGIN` es una lista de URL separadas por comas', () => {
    const result = loadEnv(apiEnvSchema, {
      ...VALID_API,
      CORS_ORIGIN: 'https://staging.nimbo.me, http://localhost:3002',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.CORS_ORIGIN).toEqual(['https://staging.nimbo.me', 'http://localhost:3002']);
  });

  it('CA-18: `CORS_ORIGIN` con un elemento que no es URL falla', () => {
    const result = loadEnv(apiEnvSchema, { ...VALID_API, CORS_ORIGIN: 'http://localhost,*' });

    expect(result).toEqual({
      ok: false,
      issues: ['`CORS_ORIGIN` debe ser una lista de URL separadas por comas'],
    });
  });

  it('CA-20: `WEB_PUBLIC_URL` con `http://` y `APP_ENV=staging` falla', () => {
    const result = loadEnv(apiEnvSchema, { ...VALID_API, APP_ENV: 'staging' });

    expect(result).toEqual({
      ok: false,
      issues: ['`WEB_PUBLIC_URL` debe usar https en staging y en producción'],
    });
  });

  it('CA-20: `WEB_PUBLIC_URL` con `https://` y `APP_ENV=production` es válido', () => {
    const result = loadEnv(apiEnvSchema, {
      ...VALID_API,
      APP_ENV: 'production',
      WEB_PUBLIC_URL: 'https://nimbo.me',
    });

    expect(result.ok).toBe(true);
  });

  it('CA-18: el `api` no declara las variables SMTP', () => {
    const result = loadEnv(apiEnvSchema, { ...VALID_API, SMTP_PASSWORD: SECRET_VALUE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env).not.toHaveProperty('SMTP_PASSWORD');
  });
});

describe('SECRET_KEYS', () => {
  it('CA-18: las claves secretas son exactamente las de `config/secret-keys.ts`', () => {
    expect([...SECRET_KEYS]).toEqual(['MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'SMTP_PASSWORD']);
  });
});
