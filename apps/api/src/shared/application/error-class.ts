/**
 * Clase de un error inesperado para la bitácora (`errorClass`): nunca su mensaje, que puede traer datos. Si lo lanzado no
 * es un `Error`, su `typeof`.
 */
export const errorClassOf = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;
