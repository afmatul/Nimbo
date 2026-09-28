import type { FieldIssueResponse } from '@nimbo/contracts';

/** Mensaje genérico de la spec 000 §10. */
export function genericErrorMessage(correlationId: string): string {
  return `Ocurrió un error inesperado. Intenta de nuevo; si persiste, comparte este código con soporte: ${correlationId}`;
}

/** Error HTTP ya interpretado: `code`, `fields` y `Retry-After` quedan a la vista del formulario. */
export class ApiClientError extends Error {
  readonly code: string;
  readonly correlationId: string;
  readonly fields: readonly FieldIssueResponse[];
  readonly retryAfterSeconds: number | undefined;

  constructor(props: {
    readonly code: string;
    readonly message: string;
    readonly correlationId: string;
    readonly fields?: readonly FieldIssueResponse[];
    readonly retryAfterSeconds?: number;
  }) {
    super(props.message);
    this.name = 'ApiClientError';
    this.code = props.code;
    this.correlationId = props.correlationId;
    this.fields = props.fields ?? [];
    this.retryAfterSeconds = props.retryAfterSeconds;
  }
}
