import type { ArgumentsHost } from '@nestjs/common';
import type { Logger } from 'nestjs-pino';
import { QueryFailedError } from 'typeorm';

import { ConflictError, InvalidInputError, TooManyRequestsError } from '../domain/errors';

import { DomainExceptionFilter, UNHANDLED_ERROR_MESSAGE_MAX } from './domain-exception.filter';

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

class ExampleConflictError extends ConflictError {
  readonly code = 'SHARED_EXAMPLE_CONFLICT';
}

const SUGGESTED_NAME = 'Informe confidencial (1).docx';

describe('DomainExceptionFilter: `details` (005 D-12, CA-20)', () => {
  const captured: string[] = [];
  const capture = (...args: unknown[]): void => {
    captured.push(JSON.stringify(args));
  };
  const capturingFilter = new DomainExceptionFilter({
    warn: capture,
    error: capture,
    log: capture,
  } as unknown as Logger);

  beforeEach(() => {
    captured.length = 0;
  });

  it('CA-6: agrega `details` al cuerpo si el error los trae', () => {
    const response = fakeResponse();

    capturingFilter.catch(
      new ExampleConflictError('Ya existe.', undefined, { suggestedName: SUGGESTED_NAME }),
      hostFor(response),
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      code: 'SHARED_EXAMPLE_CONFLICT',
      message: 'Ya existe.',
      correlationId: 'corr-1',
      details: { suggestedName: SUGGESTED_NAME },
    });
  });

  it('CA-20: la bitácora del error no lleva `details` (un 409 con `suggestedName` no llega al sink)', () => {
    capturingFilter.catch(
      new ExampleConflictError('Ya existe.', undefined, { suggestedName: SUGGESTED_NAME }),
      hostFor(fakeResponse()),
    );

    expect(captured).toHaveLength(1);
    expect(captured.join('\n')).toContain('SHARED_EXAMPLE_CONFLICT');
    expect(captured.join('\n')).not.toContain(SUGGESTED_NAME);
    expect(captured.join('\n')).not.toContain('details');
  });

  it('CA-6: sin `details` el cuerpo no tiene la clave', () => {
    const response = fakeResponse();

    capturingFilter.catch(new ExampleConflictError('Ya existe.'), hostFor(response));

    expect(response.json).toHaveBeenCalledWith(
      expect.not.objectContaining({ details: expect.anything() }),
    );
  });
});

const QUESTION = '¿Cuál es el presupuesto aprobado?';

describe('DomainExceptionFilter: error no controlado (020 CA-18, SEC-1)', () => {
  const logged: unknown[] = [];
  const loggingFilter = new DomainExceptionFilter({
    error: (entry: unknown) => logged.push(entry),
  } as unknown as Logger);

  beforeEach(() => {
    logged.length = 0;
  });

  const queryFailed = (): QueryFailedError =>
    new QueryFailedError('SELECT plainto_tsquery($1)', [QUESTION], new Error(`falló: ${QUESTION}`));

  it('CA-18: de un `QueryFailedError` registra solo clase, mensaje y pila; ni `query`, ni `parameters`, ni `driverError`', () => {
    loggingFilter.catch(queryFailed(), hostFor(fakeResponse()));

    expect(logged).toEqual([
      {
        event: 'http.unhandled_error',
        errorClass: 'QueryFailedError',
        errorMessage: `falló: ${QUESTION}`,
        stack: expect.stringMatching(/^\s+at /),
      },
    ]);
  });

  it('CA-18: la pila no repite el mensaje y el mensaje se recorta', () => {
    const long = new Error('x'.repeat(UNHANDLED_ERROR_MESSAGE_MAX + 50));

    loggingFilter.catch(long, hostFor(fakeResponse()));

    const [entry] = logged as { errorMessage: string; stack: string }[];
    expect(entry?.errorMessage).toHaveLength(UNHANDLED_ERROR_MESSAGE_MAX);
    expect(entry?.stack).not.toContain('xxx');
  });

  it('CA-18: de un valor que no es `Error` registra solo su tipo', () => {
    loggingFilter.catch(QUESTION, hostFor(fakeResponse()));

    expect(logged).toEqual([{ event: 'http.unhandled_error', errorClass: 'string' }]);
  });
});
