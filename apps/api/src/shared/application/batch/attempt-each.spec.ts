import { attemptEach } from './attempt-each';
import { IncompleteBatchError } from './incomplete-batch.error';

class DemoIncompleteError extends IncompleteBatchError {
  constructor(failed: number) {
    super(failed, `Quedaron ${String(failed)}.`);
  }
}

describe('attemptEach (PD-63)', () => {
  it('intenta todos aunque uno falle y cuenta los fallidos con solo el nombre del error', async () => {
    const done: number[] = [];
    const failures: [number, object][] = [];

    const failed = await attemptEach(
      [1, 2, 3],
      (item) =>
        item === 2 ? Promise.reject(new RangeError('dato')) : (done.push(item), Promise.resolve()),
      (item, failure) => failures.push([item, failure]),
    );

    expect(failed).toBe(1);
    expect(done).toEqual([1, 3]);
    expect(failures).toEqual([[2, { errorName: 'RangeError', code: null }]]);
  });

  it('del error toma su `code` (de dominio o de Postgres), nunca el mensaje', async () => {
    const coded = Object.assign(new Error('fila de ana@ejemplo.com'), { code: '57P01' });
    const failures: object[] = [];

    await attemptEach(
      [1],
      () => Promise.reject(coded),
      (_item, failure) => failures.push(failure),
    );

    expect(failures).toEqual([{ errorName: 'Error', code: '57P01' }]);
  });

  it('IncompleteBatchError lleva los fallidos y el nombre de la subclase', () => {
    const error = new DemoIncompleteError(2);

    expect(error).toMatchObject({ failed: 2, name: 'DemoIncompleteError', message: 'Quedaron 2.' });
  });
});
