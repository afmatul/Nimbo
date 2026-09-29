import {
  ConflictError,
  DomainError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from './index';
import type { FieldIssue } from './index';

class ExampleInvalidInputError extends InvalidInputError {
  readonly code = 'SHARED_EXAMPLE_INVALID_INPUT';
}
class ExampleUnauthorizedError extends UnauthorizedError {
  readonly code = 'SHARED_EXAMPLE_UNAUTHORIZED';
}
class ExampleForbiddenError extends ForbiddenError {
  readonly code = 'SHARED_EXAMPLE_FORBIDDEN';
}
class ExampleNotFoundError extends NotFoundError {
  readonly code = 'SHARED_EXAMPLE_NOT_FOUND';
}
class ExampleConflictError extends ConflictError {
  readonly code = 'SHARED_EXAMPLE_CONFLICT';
}

class ExampleTooManyRequestsError extends TooManyRequestsError {
  readonly code = 'SHARED_EXAMPLE_TOO_MANY_REQUESTS';
}

const MESSAGE = 'No existe el recurso solicitado. Verifica el identificador.';

describe('DomainError y subclases', () => {
  it.each([
    [ExampleInvalidInputError, InvalidInputError, 'SHARED_EXAMPLE_INVALID_INPUT', 422],
    [ExampleUnauthorizedError, UnauthorizedError, 'SHARED_EXAMPLE_UNAUTHORIZED', 401],
    [ExampleForbiddenError, ForbiddenError, 'SHARED_EXAMPLE_FORBIDDEN', 403],
    [ExampleNotFoundError, NotFoundError, 'SHARED_EXAMPLE_NOT_FOUND', 404],
    [ExampleConflictError, ConflictError, 'SHARED_EXAMPLE_CONFLICT', 409],
  ] as const)(
    'CA-16: %p expone `code`, `message` y el `status` de su clase base (%p)',
    (Concrete, Base, code, status) => {
      const error = new Concrete(MESSAGE);

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Base);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(code);
      expect(error.message).toBe(MESSAGE);
      expect(error.status).toBe(status);
    },
  );

  it('CA-16: `name` es el nombre de la clase concreta, útil en la bitácora del servidor', () => {
    const error = new ExampleNotFoundError(MESSAGE);

    expect(error.name).toBe('ExampleNotFoundError');
  });

  it('CA-16: cada clase base responde a un `status` distinto', () => {
    const statuses = [
      new ExampleInvalidInputError(MESSAGE),
      new ExampleUnauthorizedError(MESSAGE),
      new ExampleForbiddenError(MESSAGE),
      new ExampleNotFoundError(MESSAGE),
      new ExampleConflictError(MESSAGE),
    ].map((error) => error.status);

    expect(new Set(statuses).size).toBe(statuses.length);
  });
});

describe('DomainError.fields (001 CA-5, CA-6)', () => {
  const FIELDS: readonly FieldIssue[] = [
    { field: 'email', reason: 'INVALID_EMAIL', message: 'Escribe un correo válido.' },
  ];

  it('CA-6: `fields` es opcional', () => {
    expect(new ExampleInvalidInputError(MESSAGE).fields).toBeUndefined();
  });

  it('CA-6: expone los `fields` recibidos', () => {
    expect(new ExampleInvalidInputError(MESSAGE, FIELDS).fields).toEqual(FIELDS);
  });

  it('CA-6: `fields` es de solo lectura', () => {
    const error = new ExampleInvalidInputError(MESSAGE, [...FIELDS]);

    expect(Object.isFrozen(error.fields)).toBe(true);
  });
});

describe('TooManyRequestsError (001 CA-15)', () => {
  it('CA-15: expone `status = 429` y `retryAfterSeconds`, y es un `DomainError`', () => {
    const error = new ExampleTooManyRequestsError('Espera un momento.', 90);

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(90);
    expect(error.code).toBe('SHARED_EXAMPLE_TOO_MANY_REQUESTS');
    expect(error.fields).toBeUndefined();
  });
});
