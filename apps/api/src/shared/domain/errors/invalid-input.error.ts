import { DomainError } from './domain-error';

/** Regla de dominio sobre la entrada (cuota, formato). HTTP 422. */
export abstract class InvalidInputError extends DomainError {
  readonly status = 422;
}
