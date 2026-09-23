import {
  ConflictError,
  DomainError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  UnauthorizedError,
} from './index';

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
