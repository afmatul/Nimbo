/** Clase de un error inesperado para la bitácora: nunca su mensaje, que puede traer datos (CA-13, RN-5). */
export const errorClassOf = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;
