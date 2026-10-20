/**
 * Códigos de error que emite `shared`: autenticación y rol (401 y 403, spec 003 CA-1 y CA-5) y el límite de tasa
 * compartido (429, spec 009; `IDENTITY_` y `STORAGE_TOO_MANY_REQUESTS` se unifican en él, pendiente de la 009).
 */
export const SHARED_ERROR_CODES = {
  UNAUTHENTICATED: 'SHARED_UNAUTHENTICATED',
  FORBIDDEN: 'SHARED_FORBIDDEN',
  TOO_MANY_REQUESTS: 'SHARED_TOO_MANY_REQUESTS',
} as const;

export type SharedErrorCode = (typeof SHARED_ERROR_CODES)[keyof typeof SHARED_ERROR_CODES];
