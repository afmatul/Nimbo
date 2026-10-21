import { NotFoundError } from '../../../../shared/domain/errors';

/**
 * Plan consultado por id o slug que no está en el catálogo (spec 006a, CA-4).
 * El código queda `PLAN_NOT_FOUND` porque así lo fija la spec. El mensaje no repite lo buscado: el 404 es el mismo para
 * un id inexistente y para uno mal formado (011 plan §4).
 */
export class PlanNotFoundError extends NotFoundError {
  readonly code = 'PLAN_NOT_FOUND';

  constructor() {
    super('No encontramos ese plan. Revisa el catálogo de planes y vuelve a intentarlo.');
  }
}
