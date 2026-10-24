/** Códigos de error de `intelligence` (plan 019 §4). Las clases de `api` los reutilizan (Art. VI). */
export const INTELLIGENCE_ERROR_CODES = {
  /** «Reintentar» sobre un archivo que no está `fallido` (409, CA-13). */
  INTELLIGENCE_INDEXING_NOT_RETRYABLE: 'INTELLIGENCE_INDEXING_NOT_RETRYABLE',
} as const;
export type IntelligenceErrorCode =
  (typeof INTELLIGENCE_ERROR_CODES)[keyof typeof INTELLIGENCE_ERROR_CODES];
