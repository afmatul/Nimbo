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

const MINIO_KEYS = [
  'MINIO_ENDPOINT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
  'MINIO_REGION',
] as const;

const apiShape: Record<string, unknown> = apiEnvObjectSchema.shape;
const workerShape: Record<string, unknown> = workerEnvObjectSchema.shape;

/** Un secreto en ambos procesos es válido solo si los dos esquemas usan la **misma** definición. */
const definitionsAgree = (
  key: string,
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean => !Object.hasOwn(left, key) || !Object.hasOwn(right, key) || left[key] === right[key];

describe('MinIO compartido por `api` y `worker` (005 T-20)', () => {
  it.each(MINIO_KEYS)(
    'RN-2: `%s` tiene una sola definición, compuesta por ambos esquemas',
    (key) => {
      expect(declaredIn(key)).toEqual(['api', 'worker']);
      expect(apiShape[key]).toBe(workerShape[key]);
    },
  );

  it.each(SECRET_KEYS)(
    'CA-18: el secreto `%s` declarado en ambos esquemas pasa si las definiciones coinciden',
    (key) => {
      expect(definitionsAgree(key, apiShape, workerShape)).toBe(true);
    },
  );

  it('CA-18: un secreto declarado en ambos esquemas con definiciones distintas no pasa', () => {
    const divergent = { ...workerShape, MINIO_SECRET_KEY: workerEnvObjectSchema.shape.MAIL_FROM };

    expect(definitionsAgree('MINIO_SECRET_KEY', apiShape, divergent)).toBe(false);
  });

  it('CA-14: `MINIO_PUBLIC_ENDPOINT` solo lo declara el `api` (solo la API firma URLs)', () => {
    expect(declaredIn('MINIO_PUBLIC_ENDPOINT')).toEqual(['api']);
  });

  it.each([
    'UPLOAD_PART_SIZE_BYTES',
    'UPLOAD_MULTIPART_THRESHOLD_BYTES',
    'UPLOAD_URL_TTL_SECONDS',
    'UPLOAD_COMPLETE_TIMEOUT_SECONDS',
    'RATE_LIMIT_UPLOAD_INIT_PER_MINUTE',
    'RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE',
  ])('RN-16: `%s` es solo del `api`', (key) => {
    expect(declaredIn(key)).toEqual(['api']);
  });

  it.each(['UPLOAD_CLEANUP_INTERVAL_MINUTES', 'UPLOAD_CLEANUP_BATCH_SIZE'])(
    'CA-9: `%s` es solo del `worker`',
    (key) => {
      expect(declaredIn(key)).toEqual(['worker']);
    },
  );
});

describe('carpetas y papelera (006 plan §7)', () => {
  const apiIssuesFor = (patch: Record<string, string>): readonly string[] => {
    const result = loadEnv(apiEnvSchema, { ...API_ENV, ...patch });
    return result.ok ? [] : result.issues;
  };

  it('CA-9: `FOLDER_MAX_DEPTH` es solo del `api` y vale 10 por defecto', () => {
    expect(declaredIn('FOLDER_MAX_DEPTH')).toEqual(['api']);
    expect(apiEnvObjectSchema.shape.FOLDER_MAX_DEPTH.parse(undefined)).toBe(10);
  });

  it.each(['0', '51', '2.5', 'diez'])('CA-9: `FOLDER_MAX_DEPTH=%s` no pasa (1–50)', (value) => {
    expect(apiIssuesFor({ FOLDER_MAX_DEPTH: value }).join(' ')).toContain('FOLDER_MAX_DEPTH');
  });

  it.each(['TRASH_PURGE_INTERVAL_MINUTES', 'TRASH_PURGE_BATCH_SIZE'])(
    'CA-19: `%s` es solo del `worker`',
    (key) => {
      expect(declaredIn(key)).toEqual(['worker']);
    },
  );

  it('CA-19: el lote de purga se acota a 1000, como `papelera_vencida`', () => {
    const batch = workerEnvObjectSchema.shape.TRASH_PURGE_BATCH_SIZE;

    expect(batch.safeParse('1000').success).toBe(true);
    expect(batch.safeParse('1001').success).toBe(false);
    expect(batch.safeParse('0').success).toBe(false);
  });

  it.each(['USAGE_RECONCILE_INTERVAL_MINUTES', 'USAGE_RECONCILE_BATCH_SIZE'])(
    '007 CA-13: `%s` es solo del `worker`',
    (key) => {
      expect(declaredIn(key)).toEqual(['worker']);
    },
  );

  it('007 CA-13: la conciliación corre una vez al día por defecto, en páginas de 100 cuentas (1–1000)', () => {
    const { USAGE_RECONCILE_INTERVAL_MINUTES: interval, USAGE_RECONCILE_BATCH_SIZE: batch } =
      workerEnvObjectSchema.shape;

    expect(interval.parse(undefined)).toBe(1440);
    expect(batch.parse(undefined)).toBe(100);
    expect(batch.safeParse('1000').success).toBe(true);
    expect(batch.safeParse('1001').success).toBe(false);
    expect(batch.safeParse('0').success).toBe(false);
  });
});

describe('accesos rápidos (006 plan §9.2)', () => {
  const apiIssuesFor = (patch: Record<string, string>): readonly string[] => {
    const result = loadEnv(apiEnvSchema, { ...API_ENV, ...patch });
    return result.ok ? [] : result.issues;
  };

  it.each([
    ['QUICK_ACCESS_MAX_PINNED', 5],
    ['QUICK_ACCESS_RECENT_VISIBLE', 3],
  ] as const)('CA-27, CA-28: `%s` es solo del `api` y vale %i por defecto', (key, fallback) => {
    expect(declaredIn(key)).toEqual(['api']);
    expect(apiEnvObjectSchema.shape[key].parse(undefined)).toBe(fallback);
  });

  it.each([
    ['QUICK_ACCESS_MAX_PINNED', '0'],
    ['QUICK_ACCESS_MAX_PINNED', '21'],
    ['QUICK_ACCESS_RECENT_VISIBLE', '0'],
    ['QUICK_ACCESS_RECENT_VISIBLE', '21'],
    ['QUICK_ACCESS_RECENT_VISIBLE', 'tres'],
  ])('CA-27, CA-28: `%s=%s` no pasa (1–20)', (key, value) => {
    expect(apiIssuesFor({ [key]: value }).join(' ')).toContain(key);
  });
});

describe('previsualización (017 plan §5)', () => {
  const previewRate = apiEnvObjectSchema.shape.RATE_LIMIT_PREVIEW_URL_PER_MINUTE;

  it('CA-12: `RATE_LIMIT_PREVIEW_URL_PER_MINUTE` es solo del `api` y vale 120 por defecto', () => {
    expect(declaredIn('RATE_LIMIT_PREVIEW_URL_PER_MINUTE')).toEqual(['api']);
    expect(previewRate.parse(undefined)).toBe(120);
  });

  it.each(['-1', '2.5', 'cien'])(
    'CA-12: `RATE_LIMIT_PREVIEW_URL_PER_MINUTE=%s` no pasa (entero positivo; `0` en load-env)',
    (value) => {
      expect(previewRate.safeParse(value).success).toBe(false);
    },
  );
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
