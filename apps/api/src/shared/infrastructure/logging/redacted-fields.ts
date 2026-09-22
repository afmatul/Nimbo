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

/** URLs de conexión: llevan usuario y contraseña embebidos (`postgres://usuario:clave@host/bd`). */
const CONNECTION_URL_FIELDS = ['DATABASE_URL', 'REDIS_URL'] as const;

/**
 * Única lista de nombres de campo que el logger redacta, en minúsculas porque la comparación
 * es insensible a mayúsculas (`redactDeep`). Incluye las claves secretas del entorno y las URLs
 * de conexión.
 *
 * Limitación conocida: la redacción es **por nombre de campo**, así que no alcanza a una URL
 * incrustada en el texto de un mensaje o en un `stack`. Para ese caso la mitigación es no
 * registrar al pie de la letra los errores de conexión (ver `RedisHealthIndicator`).
 */
export const REDACTED_FIELDS: ReadonlySet<string> = new Set(
  [...SPEC_REDACTED_FIELDS, ...SECRET_KEYS, ...CONNECTION_URL_FIELDS].map((field) =>
    field.toLowerCase(),
  ),
);
