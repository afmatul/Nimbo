import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { redactDeep } from '../logging/redact-deep';

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
    'RATE_LIMIT_UPLOAD_INIT_PER_MINUTE',
    'RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE',
    'RATE_LIMIT_VERSION_RESTORE_PER_MINUTE',
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

describe('canal en vivo (015 plan §5)', () => {
  it('CA-14: `REALTIME_CONNECT_ATTEMPTS_PER_MINUTE` es solo del `api`, vale 60 por defecto y es positiva', () => {
    const attempts = apiEnvObjectSchema.shape.REALTIME_CONNECT_ATTEMPTS_PER_MINUTE;

    expect(declaredIn('REALTIME_CONNECT_ATTEMPTS_PER_MINUTE')).toEqual(['api']);
    expect(attempts.parse(undefined)).toBe(60);
    expect(attempts.safeParse('0').success).toBe(false);
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

describe('edición con ONLYOFFICE (016 plan §5)', () => {
  const issuesFor = (patch: Record<string, string | undefined>): readonly string[] => {
    const result = loadEnv(apiEnvSchema, { ...API_ENV, ...patch });
    return result.ok ? [] : result.issues;
  };

  it.each([
    'ONLYOFFICE_JWT_SECRET',
    'ONLYOFFICE_PUBLIC_URL',
    'ONLYOFFICE_INTERNAL_URL',
    'EDITING_CALLBACK_BASE_URL',
    'EDITING_MAX_DOC_BYTES',
  ])('CA-15: `%s` es solo del `api` y opcional (sin ONLYOFFICE el `api` arranca igual)', (key) => {
    expect(declaredIn(key)).toEqual(['api']);
    expect(issuesFor({ [key]: undefined })).toEqual([]);
  });

  it('RN-10: `EDITING_MAX_DOC_BYTES` vale 50 MB por defecto y es positiva', () => {
    const maxBytes = apiEnvObjectSchema.shape.EDITING_MAX_DOC_BYTES;

    expect(maxBytes.parse(undefined)).toBe(50 * 1024 * 1024);
    expect(maxBytes.safeParse('0').success).toBe(false);
  });

  it.each(['ONLYOFFICE_PUBLIC_URL', 'ONLYOFFICE_INTERNAL_URL', 'EDITING_CALLBACK_BASE_URL'])(
    'CA-15: `%s` debe ser una URL',
    (key) => {
      expect(issuesFor({ [key]: 'no-es-url' })).toEqual([`\`${key}\` debe ser una URL válida`]);
    },
  );

  it('plan §5: `ONLYOFFICE_JWT_SECRET` es secreta y solo la declara el `api`', () => {
    expect(SECRET_KEYS).toContain('ONLYOFFICE_JWT_SECRET');
  });

  it.each(['staging', 'production'])(
    'plan §5: con `APP_ENV=%s`, `ONLYOFFICE_JWT_SECRET` no es el valor de ejemplo ni corta',
    (appEnv) => {
      const env = { APP_ENV: appEnv, JWT_ACCESS_SECRET: STAGING_SECRET };

      expect(issuesFor({ ...env, ONLYOFFICE_JWT_SECRET: 'cambia-este-secreto-local' })).toEqual([
        '`ONLYOFFICE_JWT_SECRET` no puede ser el valor de desarrollo de .env.example',
      ]);
      expect(issuesFor({ ...env, ONLYOFFICE_JWT_SECRET: 'x'.repeat(31) })).toEqual([
        '`ONLYOFFICE_JWT_SECRET` debe tener al menos 32 caracteres en staging y en producción',
      ]);
      expect(issuesFor({ ...env, ONLYOFFICE_JWT_SECRET: STAGING_SECRET })).toEqual([]);
    },
  );
});

describe('indexación (019 plan §5)', () => {
  it.each([
    ['INDEXING_MAX_FILE_BYTES', 50 * 1024 * 1024],
    ['INDEX_RECONCILE_INTERVAL_MINUTES', 1440],
    ['INDEX_RECONCILE_BATCH_SIZE', 100],
    ['GHOSTSCRIPT_BIN', 'gs'],
  ] as const)(
    'RN-7, RN-12, D-1: `%s` es solo del `worker` y vale %p por defecto',
    (key, fallback) => {
      expect(declaredIn(key)).toEqual(['worker']);
      expect(workerEnvObjectSchema.shape[key].parse(undefined)).toBe(fallback);
    },
  );

  it('RN-6: `INDEXING_MAX_ATTEMPTS` vale 3 y es la misma definición en `api` (encola) y `worker` (agota)', () => {
    expect(declaredIn('INDEXING_MAX_ATTEMPTS')).toEqual(['api', 'worker']);
    expect(apiShape.INDEXING_MAX_ATTEMPTS).toBe(workerShape.INDEXING_MAX_ATTEMPTS);
    expect(workerEnvObjectSchema.shape.INDEXING_MAX_ATTEMPTS.parse(undefined)).toBe(3);
    expect(workerEnvObjectSchema.shape.INDEXING_MAX_ATTEMPTS.safeParse('0').success).toBe(false);
  });

  it('CA-13: `RATE_LIMIT_INDEX_RETRY_PER_MINUTE` es solo del `api`, vale 10 por defecto y es positiva', () => {
    const retries = apiEnvObjectSchema.shape.RATE_LIMIT_INDEX_RETRY_PER_MINUTE;

    expect(declaredIn('RATE_LIMIT_INDEX_RETRY_PER_MINUTE')).toEqual(['api']);
    expect(retries.parse(undefined)).toBe(10);
    expect(retries.safeParse('0').success).toBe(false);
  });

  it('RN-12: el lote de la conciliación se acota a 1000, como los otros barridos', () => {
    const batch = workerEnvObjectSchema.shape.INDEX_RECONCILE_BATCH_SIZE;

    expect(batch.safeParse('1000').success).toBe(true);
    expect(batch.safeParse('1001').success).toBe(false);
    expect(batch.safeParse('0').success).toBe(false);
  });

  it('D-1: `GHOSTSCRIPT_BIN` no puede quedar vacía', () => {
    expect(workerEnvObjectSchema.shape.GHOSTSCRIPT_BIN.safeParse('').success).toBe(false);
  });
});

describe('Gemini y agente con citas (020 plan D-8)', () => {
  const apiIssuesFor = (patch: Record<string, string | undefined>): readonly string[] => {
    const result = loadEnv(apiEnvSchema, { ...API_ENV, ...patch });
    return result.ok ? [] : result.issues;
  };

  it.each(['GEMINI_API_KEY', 'GEMINI_EMBEDDING_MODEL'])(
    'D-8: `%s` tiene una sola definición, compuesta por `api` (pregunta) y `worker` (indexa)',
    (key) => {
      expect(declaredIn(key)).toEqual(['api', 'worker']);
      expect(apiShape[key]).toBe(workerShape[key]);
    },
  );

  it('CA-18: `GEMINI_API_KEY` es secreta, opcional (vacía cuenta como ausente) y se redacta en bitácoras', () => {
    const key = apiEnvObjectSchema.shape.GEMINI_API_KEY;

    expect(SECRET_KEYS).toContain('GEMINI_API_KEY');
    expect(key.parse('')).toBeUndefined();
    expect(key.parse(undefined)).toBeUndefined();
    expect(redactDeep({ GEMINI_API_KEY: 'AIza-clave-de-prueba' })).toEqual({
      GEMINI_API_KEY: '[REDACTED]',
    });
  });

  it('CA-18: el valor inválido de una variable del agente no aparece en el mensaje', () => {
    const issues = apiIssuesFor({ AGENT_MAX_QUESTION_CHARS: 'mil-caracteres' });

    expect(issues).toEqual(['`AGENT_MAX_QUESTION_CHARS` debe ser un entero positivo']);
    expect(issues.join()).not.toContain('mil-caracteres');
  });

  it('RNF-09: sin clave el `api` arranca igual (el agente responde `AGENT_UNAVAILABLE`)', () => {
    expect(apiIssuesFor({ GEMINI_API_KEY: undefined })).toEqual([]);
  });

  it.each([
    ['GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001'],
    ['GEMINI_CHAT_MODEL', 'gemini-3.5-flash'],
    ['AGENT_MAX_QUESTION_CHARS', 1000],
    ['AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS', 10_000],
    ['AGENT_MODEL_IDLE_TIMEOUT_MS', 10_000],
  ] as const)('RN-7, D-7: `%s` vale %p por defecto', (key, fallback) => {
    expect(apiEnvObjectSchema.shape[key].parse(undefined)).toBe(fallback);
  });

  it.each([
    'GEMINI_CHAT_MODEL',
    'AGENT_MAX_QUESTION_CHARS',
    'AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS',
    'AGENT_MODEL_IDLE_TIMEOUT_MS',
  ])('D-8: `%s` es solo del `api`', (key) => {
    expect(declaredIn(key)).toEqual(['api']);
  });

  it.each([
    'AGENT_MAX_QUESTION_CHARS',
    'AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS',
    'AGENT_MODEL_IDLE_TIMEOUT_MS',
  ])('RN-7, CA-15: `%s=0` no pasa (entero positivo)', (key) => {
    expect(apiIssuesFor({ [key]: '0' })).toEqual([`\`${key}\` debe ser un entero positivo`]);
  });

  it('D-1, D-7: los modelos no pueden quedar vacíos', () => {
    expect(apiEnvObjectSchema.shape.GEMINI_EMBEDDING_MODEL.safeParse('').success).toBe(false);
    expect(apiEnvObjectSchema.shape.GEMINI_CHAT_MODEL.safeParse('').success).toBe(false);
  });
});
