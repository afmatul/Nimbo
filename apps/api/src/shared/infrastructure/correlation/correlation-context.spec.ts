import { CorrelationContext, isValidCorrelationId } from './correlation-context';

describe('isValidCorrelationId', () => {
  it.each(['a', 'abc-123', 'x'.repeat(128), '!~', '2f0c9c2e-1b1a-4c2e-9e2f-0d5b6a7c8d9e'])(
    'CA-13: acepta %p (1–128 caracteres ASCII imprimibles sin espacios)',
    (value) => {
      expect(isValidCorrelationId(value)).toBe(true);
    },
  );

  it.each([
    ['vacío', ''],
    ['129 caracteres', 'x'.repeat(129)],
    ['espacio', 'abc 123'],
    ['tabulador', 'abc\t123'],
    ['no ASCII', 'señal'],
    ['salto de línea', 'abc\n'],
  ])('CA-13: rechaza %s', (_label, value) => {
    expect(isValidCorrelationId(value)).toBe(false);
  });
});

describe('CorrelationContext', () => {
  it('CA-13: `get()` fuera de `run()` devuelve `undefined`', () => {
    expect(CorrelationContext.get()).toBeUndefined();
  });

  it('CA-13: `run()` expone el almacén dentro del callback y devuelve su resultado', () => {
    const result = CorrelationContext.run({ correlationId: 'corr-1', jobId: 'job-1' }, () => {
      return CorrelationContext.get();
    });

    expect(result).toEqual({ correlationId: 'corr-1', jobId: 'job-1' });
  });

  it('CA-13: contextos concurrentes no se mezclan a través de esperas asíncronas', async () => {
    const seen: string[] = [];
    const task = (id: string, delayMs: number): Promise<void> =>
      CorrelationContext.run({ correlationId: id }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        seen.push(CorrelationContext.get()?.correlationId ?? 'perdido');
      });

    await Promise.all([task('a', 20), task('b', 5), task('c', 10)]);

    expect(seen.sort()).toEqual(['a', 'b', 'c']);
    expect(CorrelationContext.get()).toBeUndefined();
  });
});
