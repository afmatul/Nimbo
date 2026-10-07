import { DomainError } from '../../../../shared/domain/errors/domain-error';

export class PlanCatalogUnavailableError extends DomainError {
  readonly code = 'PLAN_CATALOG_UNAVAILABLE';
  readonly status = 500;

  constructor() {
    super('No pudimos cargar los planes. Intenta recargar la página.');
  }
}