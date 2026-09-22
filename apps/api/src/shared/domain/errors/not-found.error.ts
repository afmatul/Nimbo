import { DomainError } from './domain-error';

/** Recurso inexistente o fuera del alcance del actor. HTTP 404. */
export abstract class NotFoundError extends DomainError {
  readonly status = 404;
}
