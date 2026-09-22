import { DomainError } from './domain-error';

/** Actor autenticado sin permiso sobre el recurso. HTTP 403. */
export abstract class ForbiddenError extends DomainError {
  readonly status = 403;
}
