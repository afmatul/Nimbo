import { z } from 'zod';

import { InvalidInputError } from '../domain/errors';
import type { FieldIssue } from '../domain/errors';

import { ZodValidationPipe } from './zod-validation.pipe';

class ExampleInvalidInputError extends InvalidInputError {
  readonly code = 'SHARED_EXAMPLE_INVALID_INPUT';
}

const MESSAGE = 'Revisa los campos marcados y corrígelos para continuar.';

const schema = z
  .object({
    name: z.string().min(1, 'Escribe un nombre.'),
    age: z.number().int(),
  })
  .strict('Quita este campo.');

const buildPipe = () => {
  const factory = jest.fn(
    (issues: readonly FieldIssue[]) => new ExampleInvalidInputError(MESSAGE, issues),
  );
  return { pipe: new ZodValidationPipe(schema, factory), factory };
};

const BODY_METADATA = { type: 'body' } as const;

describe('ZodValidationPipe (ADR-0020)', () => {
  it('CA-6: un cuerpo válido devuelve el valor parseado', () => {
    const { pipe, factory } = buildPipe();

    expect(pipe.transform({ name: 'Ana', age: 30 }, BODY_METADATA)).toEqual({
      name: 'Ana',
      age: 30,
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('CA-6: un cuerpo inválido lanza el error de la fábrica con los `FieldIssue` de `toFieldIssues`', () => {
    const { pipe, factory } = buildPipe();

    expect(() => pipe.transform({ name: '', age: 1.5, rol: 'ADMIN' }, BODY_METADATA)).toThrow(
      ExampleInvalidInputError,
    );
    expect(factory).toHaveBeenCalledWith([
      { field: 'name', reason: 'INVALID', message: 'Escribe un nombre.' },
      { field: 'age', reason: 'INVALID', message: expect.any(String) as string },
      { field: 'rol', reason: 'UNKNOWN_FIELD', message: 'Quita este campo.' },
    ]);
  });

  it('CA-7: el error lanzado lleva los `fields`', () => {
    const { pipe } = buildPipe();

    try {
      pipe.transform({ name: 'Ana', age: 1, plan: 'x' }, BODY_METADATA);
      throw new Error('debía lanzar');
    } catch (error) {
      expect((error as ExampleInvalidInputError).fields).toEqual([
        { field: 'plan', reason: 'UNKNOWN_FIELD', message: 'Quita este campo.' },
      ]);
    }
  });

  it.each([
    ['`undefined`', undefined],
    ['`{}`', {}],
  ])('CA-6: un cuerpo %s (así llega un `text/plain`) produce los `REQUIRED`', (_label, body) => {
    const { pipe, factory } = buildPipe();

    expect(() => pipe.transform(body, BODY_METADATA)).toThrow(ExampleInvalidInputError);
    expect(factory.mock.calls[0]?.[0].map((issue) => `${issue.field}:${issue.reason}`)).toEqual([
      'name:REQUIRED',
      'age:REQUIRED',
    ]);
  });
});
