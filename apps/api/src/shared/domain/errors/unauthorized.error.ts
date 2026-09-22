import { DomainError } from './domain-error';

/** Actor no autenticado o credenciales inválidas. HTTP 401. */
export abstract class UnauthorizedError extends DomainError {
  readonly status = 401;
}
