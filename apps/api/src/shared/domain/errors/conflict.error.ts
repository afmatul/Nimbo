import { DomainError } from './domain-error';

/** Estado actual incompatible con la operación (duplicados, sesiones, pagos). HTTP 409. */
export abstract class ConflictError extends DomainError {
  readonly status = 409;
}
