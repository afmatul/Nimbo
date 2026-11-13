import { DomainError } from '../../domain/errors';

import { settleEach } from './settle-each';

class GoneError extends DomainError {
  readonly code = 'TEST_GONE';
  readonly status = 404;
}

describe('settleEach (lotes HTTP)', () => {
  it('intenta cada elemento en orden y separa los que salieron bien de los que fallaron con su código', async () => {
    const seen: number[] = [];

    const result = await settleEach([1, 2, 3], (n) => {
      seen.push(n);
      return n === 2 ? Promise.reject(new GoneError('no está')) : Promise.resolve();
    });

    expect(seen).toEqual([1, 2, 3]);
    expect(result).toEqual({ succeeded: [1, 3], failed: [{ item: 2, code: 'TEST_GONE' }] });
  });

  it('un error que no es de dominio no se disfraza de fallo de un elemento: se propaga', async () => {
    await expect(settleEach([1], () => Promise.reject(new Error('BD caída')))).rejects.toThrow(
      'BD caída',
    );
  });
});
