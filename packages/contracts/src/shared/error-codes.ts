/** Códigos de error de autenticación y rol que emite `shared` (401 y 403, spec 003 CA-1 y CA-5). */
export const SHARED_ERROR_CODES = {
  UNAUTHENTICATED: 'SHARED_UNAUTHENTICATED',
  FORBIDDEN: 'SHARED_FORBIDDEN',
} as const;

export type SharedErrorCode = (typeof SHARED_ERROR_CODES)[keyof typeof SHARED_ERROR_CODES];
