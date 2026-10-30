import { InvalidInputError } from '../../../../shared/domain/errors';

/** Motivo del rechazo (CA-6); el mismo conjunto que `AGENT_INVALID_QUESTION_REASONS` de los contratos. */
export type AgentInvalidQuestionReason = 'empty' | 'too_long';

const messageFor = (reason: AgentInvalidQuestionReason, maxChars: number): string =>
  reason === 'empty'
    ? 'Escribe una pregunta sobre tus documentos.'
    : `La pregunta supera los ${String(maxChars)} caracteres. Acórtala e inténtalo de nuevo.`;

/**
 * Pregunta vacía o más larga que `AGENT_MAX_QUESTION_CHARS` (CA-6, RN-7). HTTP 422 con `details.reason`; no se descuenta
 * consulta. El dominio no importa `@nimbo/contracts` (ADR-0008): la prueba ata `code` a `INTELLIGENCE_ERROR_CODES`.
 */
export class AgentInvalidQuestionError extends InvalidInputError {
  readonly code = 'AGENT_INVALID_QUESTION';

  constructor(reason: AgentInvalidQuestionReason, maxChars: number) {
    super(messageFor(reason, maxChars), undefined, { reason });
  }
}
