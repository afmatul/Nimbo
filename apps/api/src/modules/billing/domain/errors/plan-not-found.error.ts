import { NotFoundError } from '../../../../shared/domain/errors';

/**
 * Plan consultado por id o slug que no está en el catálogo (spec 006a, CA-4).
 * El código queda `PLAN_NOT_FOUND` porque así lo fija la spec.
 */
export class PlanNotFoundError extends NotFoundError {
  readonly code = 'PLAN_NOT_FOUND';

  constructor(identifier: string) {
    super(`Plan no encontrado: ${identifier}`);
  }
}
