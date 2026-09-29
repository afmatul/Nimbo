/**
 * Variables de entorno secretas (plan 000 §6.2; 001 plan §6.10). `env-report.ts` nunca imprime su valor y
 * `REDACTED_FIELDS` las redacta en bitácoras de ambos procesos. Cada una se declara en el esquema de al menos un
 * proceso (`env.schema.ts` lo comprueba): `SMTP_PASSWORD` solo en el `worker`.
 */
export const SECRET_KEYS = ['MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'SMTP_PASSWORD'] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];
