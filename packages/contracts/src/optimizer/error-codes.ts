/** Códigos de error del optimizador (plan 021 §4). Las clases de `api` los reutilizan (Art. VI). */
export const OPTIMIZER_ERROR_CODES = {
  /** Un tipo que no es JPEG ni PNG por su contenido real (422, CA-3, CA-4). */
  OPTIMIZER_UNSUPPORTED_TYPE: 'OPTIMIZER_UNSUPPORTED_TYPE',
  OPTIMIZER_ESTIMATE_STALE: 'OPTIMIZER_ESTIMATE_STALE',
} as const;
export type OptimizerErrorCode = (typeof OPTIMIZER_ERROR_CODES)[keyof typeof OPTIMIZER_ERROR_CODES];
