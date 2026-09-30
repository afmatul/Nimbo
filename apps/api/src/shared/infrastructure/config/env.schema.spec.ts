import { apiEnvObjectSchema, SECRET_KEYS, workerEnvObjectSchema } from './env.schema';

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
