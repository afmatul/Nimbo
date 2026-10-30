import { DomainError } from '../../../../shared/domain/errors';

/** Fecha larga de Guatemala («1 de noviembre de 2026»), sin depender de la zona del servidor. */
const RESET_DATE_FORMAT = new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const renewalSentence = (resetsAt: Date | null): string =>
  resetsAt === null
    ? 'Se renuevan cuando renueves tu plan.'
    : `Se renuevan el ${RESET_DATE_FORMAT.format(resetsAt)}.`;

/**
 * Se agotaron las consultas del periodo (CA-11, RN-3). HTTP 429 con `details.limit` y, si el contador se renueva solo,
 * `details.resetsAt` (ISO). `resetsAt` es `null` en solo lectura: el periodo venció y no se reinicia hasta pagar (P-9).
 * No es un `TooManyRequestsError`: no es un límite de tasa y no lleva `Retry-After`.
 */
export class AgentQuotaExceededError extends DomainError {
  readonly code = 'AGENT_QUOTA_EXCEEDED';
  readonly status = 429;

  constructor(limit: number, resetsAt: Date | null) {
    super(
      `Usaste tus ${String(limit)} consultas de este mes. ${renewalSentence(resetsAt)}`,
      undefined,
      resetsAt === null ? { limit } : { limit, resetsAt: resetsAt.toISOString() },
    );
  }
}
