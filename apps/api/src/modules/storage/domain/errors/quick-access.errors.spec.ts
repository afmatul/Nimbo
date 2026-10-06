import { InvalidInputError } from '../../../../shared/domain/errors';

import { QuickAccessLimitError } from './index';

describe('errores de accesos rápidos (plan 006 §9.2)', () => {
  it('CA-28: `QuickAccessLimitError` es un 422 con el tope en el mensaje y en `details.maxPinned`', () => {
    const error = new QuickAccessLimitError(5);

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('STORAGE_QUICK_ACCESS_LIMIT');
    expect(error.message).toBe('Ya fijaste 5 elementos. Quita uno para fijar otro.');
    expect(error.details).toEqual({ maxPinned: 5 });
  });

  it('CA-28: el número sale de la configuración, no es fijo', () => {
    const error = new QuickAccessLimitError(8);

    expect(error.message).toBe('Ya fijaste 8 elementos. Quita uno para fijar otro.');
    expect(error.details).toEqual({ maxPinned: 8 });
  });
});
