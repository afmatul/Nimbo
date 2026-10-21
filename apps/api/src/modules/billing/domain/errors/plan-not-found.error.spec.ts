import { DomainError, NotFoundError } from '../../../../shared/domain/errors';

import { PlanNotFoundError } from './plan-not-found.error';

describe('PlanNotFoundError (CA-4)', () => {
  it('hereda de NotFoundError y DomainError', () => {
    const error = new PlanNotFoundError();

    expect(error).toBeInstanceOf(PlanNotFoundError);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
  });

  it('fija el código PLAN_NOT_FOUND y el status HTTP 404', () => {
    const error = new PlanNotFoundError();

    expect(error.code).toBe('PLAN_NOT_FOUND');
    expect(error.status).toBe(404);
  });

  it('011 plan §4: el mensaje en español no repite el identificador buscado (mismo 404 para todos)', () => {
    const error = new PlanNotFoundError();

    expect(error.message).toBe(
      'No encontramos ese plan. Revisa el catálogo de planes y vuelve a intentarlo.',
    );
    expect(error.name).toBe('PlanNotFoundError');
  });
});
