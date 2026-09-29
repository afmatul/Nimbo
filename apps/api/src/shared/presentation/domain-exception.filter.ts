import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { ErrorResponse } from '@nimbo/contracts';
import type { Response } from 'express';
import type { Logger } from 'nestjs-pino';

import { DomainError, TooManyRequestsError } from '../domain/errors';
import type { FieldIssue } from '../domain/errors';
import { CorrelationContext } from '../infrastructure/correlation/correlation-context';
import { CORRELATION_ID_HEADER } from '../infrastructure/correlation/correlation-id.middleware';

const INTERNAL_ERROR_MESSAGE =
  'Ocurrió un error inesperado. Inténtalo de nuevo más tarde; si persiste, contacta a soporte con el identificador de correlación.';
const VALIDATION_FAILED_MESSAGE =
  'Los datos enviados no son válidos. Revisa los campos e inténtalo de nuevo.';
const httpErrorMessage = (status: number): string =>
  `La petición no pudo procesarse (HTTP ${String(status)}). Verifica la ruta, el método y los datos enviados.`;

const RETRY_AFTER_HEADER = 'Retry-After';

interface Translated {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly fields?: readonly FieldIssue[];
  readonly retryAfterSeconds?: number;
}

const translateHttpException = (exception: HttpException): Translated => {
  const status = exception.getStatus();
  return status === (HttpStatus.BAD_REQUEST as number)
    ? { status, code: 'VALIDATION_FAILED', message: VALIDATION_FAILED_MESSAGE }
    : { status, code: `HTTP_${String(status)}`, message: httpErrorMessage(status) };
};

const translateDomainError = (error: DomainError): Translated => ({
  status: error.status,
  code: error.code,
  message: error.message,
  ...(error.fields === undefined ? {} : { fields: error.fields }),
  ...(error instanceof TooManyRequestsError ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
});

/**
 * Único traductor de errores a HTTP (Art. VII.5, CA-16, RN-1). Cuerpo siempre `{ code, message, correlationId }`,
 * más `fields` si el error de entrada los trae (001 CA-5, CA-6); nunca `stack`, nombre de clase ni rutas. Un
 * `TooManyRequestsError` agrega `Retry-After` (001 CA-15). `DomainError` usa el `status` de su clase y el mensaje que la
 * subclase definió; `HttpException` conserva su estado; todo lo demás es `500 INTERNAL_ERROR` con detalle
 * solo en la bitácora `http.unhandled_error`.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const correlationId = this.correlationIdOf(response);
    const translated = this.translate(exception);
    const body: ErrorResponse = {
      code: translated.code,
      message: translated.message,
      correlationId,
      ...(translated.fields === undefined ? {} : { fields: [...translated.fields] }),
    };
    if (translated.retryAfterSeconds !== undefined) {
      response.setHeader(RETRY_AFTER_HEADER, String(translated.retryAfterSeconds));
    }
    response.status(translated.status).json(body);
  }

  private translate(exception: unknown): Translated {
    if (exception instanceof DomainError) {
      this.logger.warn({
        event: 'http.domain_error',
        code: exception.code,
        status: exception.status,
      });
      return translateDomainError(exception);
    }
    if (exception instanceof HttpException) {
      return translateHttpException(exception);
    }
    this.logger.error({ event: 'http.unhandled_error', err: exception });
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: INTERNAL_ERROR_MESSAGE,
    };
  }

  private correlationIdOf(response: Response): string {
    const fromContext = CorrelationContext.get()?.correlationId;
    if (fromContext !== undefined) {
      return fromContext;
    }
    const fromHeader = response.getHeader(CORRELATION_ID_HEADER);
    return typeof fromHeader === 'string' ? fromHeader : '';
  }
}
