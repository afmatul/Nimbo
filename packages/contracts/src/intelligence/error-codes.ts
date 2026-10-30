/**
 * Códigos de error de `intelligence`: indexación (plan 019 §4) y agente (plan 020 §4). Las clases de `api` repiten el
 * literal y su prueba los ata aquí (ADR-0008, Art. VI).
 */
export const INTELLIGENCE_ERROR_CODES = {
  /** «Reintentar» sobre un archivo que no está `fallido` (409, 019 CA-13). */
  INTELLIGENCE_INDEXING_NOT_RETRYABLE: 'INTELLIGENCE_INDEXING_NOT_RETRYABLE',
  /** Pregunta vacía o más larga que el máximo (422 con `details.reason`, 020 CA-6). */
  AGENT_INVALID_QUESTION: 'AGENT_INVALID_QUESTION',
  /** Ámbito inexistente o no accesible, sin distinguirlos (404, 020 CA-17). */
  AGENT_SCOPE_NOT_FOUND: 'AGENT_SCOPE_NOT_FOUND',
  /** Consultas del periodo agotadas (429 con `details.limit` y `details.resetsAt`, 020 CA-11). */
  AGENT_QUOTA_EXCEEDED: 'AGENT_QUOTA_EXCEEDED',
  /** Proveedor del modelo caído, lento o sin configurar (503, o evento `error` a mitad del flujo; 020 CA-15). */
  AGENT_UNAVAILABLE: 'AGENT_UNAVAILABLE',
} as const;
export type IntelligenceErrorCode =
  (typeof INTELLIGENCE_ERROR_CODES)[keyof typeof INTELLIGENCE_ERROR_CODES];
