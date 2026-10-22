/**
 * Lo único que se registra de un error (PD-63): su nombre. El mensaje puede traer datos (una clave de objeto, un
 * correo, una consulta), así que las bitácoras nunca lo llevan.
 */
export const errorName = (error: unknown): string =>
  error instanceof Error ? error.name : 'unknown';
