import { DomainError } from '../../../../shared/domain/errors/domain-error';

/**
 * CA-3: la lectura de `plan` falló. Solo lo lanza el repositorio al fallar la consulta; `causeName` guarda el tipo del
 * error original para la bitácora técnica, sin mensaje ni SQL (plan 008 §5). No viaja en la respuesta.
 */
export class PlanCatalogUnavailableError extends DomainError {
  readonly code = 'BILLING_PLAN_CATALOG_UNAVAILABLE';
  readonly status = 500;
  readonly causeName: string;

  constructor(cause: unknown) {
    super('No pudimos cargar los planes. Intenta recargar la página.');
    this.causeName = cause instanceof Error ? cause.name : 'unknown';
  }
}
