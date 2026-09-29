import type { ArgumentsHost } from '@nestjs/common';
import type { Logger } from 'nestjs-pino';

import { InvalidInputError, TooManyRequestsError } from '../domain/errors';

import { DomainExceptionFilter } from './domain-exception.filter';

class ExampleInvalidInputError extends InvalidInputError {
  readonly code = 'SHARED_EXAMPLE_INVALID_INPUT';
}
class ExampleTooManyRequestsError extends TooManyRequestsError {
  readonly code = 'SHARED_EXAMPLE_TOO_MANY_REQUESTS';
}

const FIELDS = [{ field: 'email', reason: 'INVALID_EMAIL', message: 'Escribe un correo válido.' }];

const fakeResponse = () => {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    getHeader: jest.fn().mockReturnValue('corr-1'),
  };
  response.status.mockReturnValue(response);
  return response;
};

const hostFor = (response: ReturnType<typeof fakeResponse>): ArgumentsHost =>
  ({ switchToHttp: () => ({ getResponse: () => response }) }) as unknown as ArgumentsHost;

const filter = new DomainExceptionFilter({
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger);

describe('DomainExceptionFilter: `fields` y `Retry-After` (001 CA-6, CA-15)', () => {
  it('CA-6: agrega `fields` al cuerpo si el error los trae', () => {
    const response = fakeResponse();

    filter.catch(new ExampleInvalidInputError('Revisa los campos.', FIELDS), hostFor(response));

    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      code: 'SHARED_EXAMPLE_INVALID_INPUT',
      message: 'Revisa los campos.',
      correlationId: 'corr-1',
      fields: FIELDS,
    });
  });

  it('CA-6: sin `fields` el cuerpo no tiene la clave', () => {
    const response = fakeResponse();

    filter.catch(new ExampleInvalidInputError('Revisa los campos.'), hostFor(response));

    expect(response.json).toHaveBeenCalledWith({
      code: 'SHARED_EXAMPLE_INVALID_INPUT',
      message: 'Revisa los campos.',
      correlationId: 'corr-1',
    });
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('CA-15: un `TooManyRequestsError` agrega `Retry-After` con sus segundos', () => {
    const response = fakeResponse();

    filter.catch(new ExampleTooManyRequestsError('Espera.', 90), hostFor(response));

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '90');
  });
});
