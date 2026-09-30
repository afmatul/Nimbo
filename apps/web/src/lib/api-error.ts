import type { FieldIssueResponse } from '@nimbo/contracts';

/** Mensaje genérico de la spec 000 §10. */
export function genericErrorMessage(correlationId: string): string {
  return `Ocurrió un error inesperado. Intenta de nuevo; si persiste, comparte este código con soporte: ${correlationId}`;
}

/** `details` de `ErrorResponse` (005 D-12): objeto plano con cifras, `suggestedName` o `reason`. */
export type ApiErrorDetails = Readonly<Record<string, string | number | boolean>>;

/**
 * Error HTTP ya interpretado: `code`, `fields`, `details` y `Retry-After` quedan a la vista de la pantalla. `status` es
 * el HTTP de la respuesta; `undefined` si no hubo respuesta (red caída).
 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly correlationId: string;
  readonly fields: readonly FieldIssueResponse[];
  readonly details: ApiErrorDetails;
  readonly retryAfterSeconds: number | undefined;
  readonly status: number | undefined;

  constructor(props: {
    readonly code: string;
    readonly message: string;
    readonly correlationId: string;
    readonly fields?: readonly FieldIssueResponse[];
    readonly details?: ApiErrorDetails;
    readonly retryAfterSeconds?: number | undefined;
    readonly status?: number | undefined;
  }) {
    super(props.message);
    this.name = 'ApiClientError';
    this.code = props.code;
    this.correlationId = props.correlationId;
    this.fields = props.fields ?? [];
    this.details = props.details ?? {};
    this.retryAfterSeconds = props.retryAfterSeconds;
    this.status = props.status;
  }
}

/** Un fallo que no llegó como `ApiClientError` se trata como el error genérico de 000 §10. */
export function toApiClientError(caught: unknown): ApiClientError {
  if (caught instanceof ApiClientError) return caught;
  return new ApiClientError({
    code: 'INTERNAL_ERROR',
    message: genericErrorMessage(''),
    correlationId: '',
  });
}
