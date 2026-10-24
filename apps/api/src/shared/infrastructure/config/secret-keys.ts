/**
 * Variables de entorno secretas (plan 000 §6.2; 001 plan §6.10). `env-report.ts` nunca imprime su valor y
 * `REDACTED_FIELDS` las redacta en bitácoras de ambos procesos. Cada una se declara en el esquema de al menos un
 * proceso (`env.schema.ts` lo comprueba): `SMTP_PASSWORD` y `GEMINI_API_KEY` (019) solo en el `worker`;
 * `JWT_ACCESS_SECRET` (002) y `ONLYOFFICE_JWT_SECRET` (016) solo en el `api`.
 */
export const SECRET_KEYS = [
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'SMTP_PASSWORD',
  'JWT_ACCESS_SECRET',
  'ONLYOFFICE_JWT_SECRET',
  'GEMINI_API_KEY',
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];
