/**
 * Variables de entorno secretas (plan 000 §6.2). `env-report.ts` (T-13) nunca imprime su valor y
 * `REDACTED_FIELDS` las redacta en bitácoras. `env.schema.ts` (T-13) las marca como secretas desde aquí.
 */
export const SECRET_KEYS = ['MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];
