import { SECRET_KEYS } from '../config/secret-keys';

/** Los 13 campos de CA-15 (RN-2). */
const SPEC_REDACTED_FIELDS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'fileName',
  'nombre',
  'content',
  'prompt',
] as const;

/**
 * Única lista de nombres de campo que el logger redacta, en minúsculas porque la comparación
 * es insensible a mayúsculas (`redactDeep`). Incluye las claves secretas del entorno.
 */
export const REDACTED_FIELDS: ReadonlySet<string> = new Set(
  [...SPEC_REDACTED_FIELDS, ...SECRET_KEYS].map((field) => field.toLowerCase()),
);
