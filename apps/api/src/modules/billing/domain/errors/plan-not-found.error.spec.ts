import { DomainError, NotFoundError } from '../../../../shared/domain/errors';

import { PlanNotFoundError } from './plan-not-found.error';

describe('PlanNotFoundError (CA-4)', () => {
  it('hereda de NotFoundError y DomainError', () => {
    const error = new PlanNotFoundError('plan-inexistente');

    expect(error).toBeInstanceOf(PlanNotFoundError);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
  });

  it('fija el código PLAN_NOT_FOUND y el status HTTP 404', () => {
    const error = new PlanNotFoundError('10000000-0000-4000-8000-000000000099');

    expect(error.code).toBe('PLAN_NOT_FOUND');
    expect(error.status).toBe(404);
  });

  it('incluye el identificador buscado en un mensaje en español', () => {
    const error = new PlanNotFoundError('enterprise');

    expect(error.message).toBe('Plan no encontrado: enterprise');
    expect(error.name).toBe('PlanNotFoundError');
  });
});
