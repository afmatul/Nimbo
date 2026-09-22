import { BadRequestException, Controller, Get, NotFoundException } from '@nestjs/common';
import request from 'supertest';

import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  UnauthorizedError,
} from '../../../src/shared';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

class SharedExampleNotFoundError extends NotFoundError {
  readonly code = 'SHARED_EXAMPLE_NOT_FOUND';
}
class SharedExampleConflictError extends ConflictError {
  readonly code = 'SHARED_EXAMPLE_CONFLICT';
}
class SharedExampleInvalidInputError extends InvalidInputError {
  readonly code = 'SHARED_EXAMPLE_INVALID_INPUT';
}
class SharedExampleUnauthorizedError extends UnauthorizedError {
  readonly code = 'SHARED_EXAMPLE_UNAUTHORIZED';
}
class SharedExampleForbiddenError extends ForbiddenError {
  readonly code = 'SHARED_EXAMPLE_FORBIDDEN';
}

const NOT_FOUND_MESSAGE = 'No existe el recurso solicitado. Verifica el identificador.';

/** Controlador de prueba (spec CA-16): cada ruta lanza un tipo de error. */
@Controller('errors-probe')
class ErrorsProbeController {
  @Get('not-found')
  notFound(): never {
    throw new SharedExampleNotFoundError(NOT_FOUND_MESSAGE);
  }

  @Get('conflict')
  conflict(): never {
    throw new SharedExampleConflictError('Ya existe un recurso igual. Usa otro nombre.');
  }

  @Get('invalid-input')
  invalidInput(): never {
    throw new SharedExampleInvalidInputError('El archivo supera la cuota. Libera espacio.');
  }

  @Get('unauthorized')
  unauthorized(): never {
    throw new SharedExampleUnauthorizedError('Inicia sesión para continuar.');
  }

  @Get('forbidden')
  forbidden(): never {
    throw new SharedExampleForbiddenError(
      'No tienes permiso sobre este recurso. Pide acceso al dueño.',
    );
  }

  @Get('unhandled')
  unhandled(): never {
    throw new Error('fallo interno con detalle sensible: /srv/nimbo/secret.ts');
  }

  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException(['name must be a string']);
  }

  @Get('nest-not-found')
  nestNotFound(): never {
    throw new NotFoundException();
  }
}

const FORBIDDEN_IN_BODY = ['stack', 'SharedExample', 'at ', '.ts', 'ErrorsProbe', '/srv/'];

describe('DomainExceptionFilter (CA-16)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ controllers: [ErrorsProbeController] });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    testApp.logs.clear();
  });

  const get = (path: string): request.Test =>
    request(testApp.app.getHttpServer()).get(`/api/v1/errors-probe/${path}`);

  it('CA-16: una subclase de `DomainError` → status de su clase y cuerpo exacto { code, message, correlationId }', async () => {
    const response = await get('not-found').set('x-correlation-id', 'corr-16');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'SHARED_EXAMPLE_NOT_FOUND',
      message: NOT_FOUND_MESSAGE,
      correlationId: 'corr-16',
    });
    for (const forbidden of FORBIDDEN_IN_BODY) {
      expect(JSON.stringify(response.body)).not.toContain(forbidden);
    }
    expect(testApp.logs.withCorrelationId('corr-16').map((line) => line.event)).toContain(
      'http.domain_error',
    );
  });

  it.each([
    ['conflict', 409, 'SHARED_EXAMPLE_CONFLICT'],
    ['invalid-input', 422, 'SHARED_EXAMPLE_INVALID_INPUT'],
    ['unauthorized', 401, 'SHARED_EXAMPLE_UNAUTHORIZED'],
    ['forbidden', 403, 'SHARED_EXAMPLE_FORBIDDEN'],
  ])('CA-16: `%s` → %i con code %s', async (path, status, code) => {
    const response = await get(path);

    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ code, correlationId: expect.any(String) });
    expect(Object.keys(response.body).sort()).toEqual(['code', 'correlationId', 'message']);
  });

  it('CA-16: error no controlado → 500 `INTERNAL_ERROR`, mensaje genérico y detalle solo en la bitácora', async () => {
    const response = await get('unhandled').set('x-correlation-id', 'corr-500');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: expect.stringMatching(/inesperado/),
      correlationId: 'corr-500',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret.ts');
    const unhandled = testApp.logs
      .withCorrelationId('corr-500')
      .find((line) => line.event === 'http.unhandled_error');
    expect(unhandled).toBeDefined();
    expect(unhandled?.err).toMatchObject({ message: expect.stringContaining('secret.ts') });
  });

  it('CA-16: `BadRequestException` (ValidationPipe) → 400 `VALIDATION_FAILED` con la misma forma', async () => {
    const response = await get('bad-request');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: expect.any(String),
      correlationId: expect.any(String),
    });
  });

  it('CA-16: otras `HttpException` de Nest conservan su estado con code `HTTP_<STATUS>`', async () => {
    const response = await get('nest-not-found');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'HTTP_404' });
  });

  it('CA-16: una ruta inexistente también responde con la forma única de error', async () => {
    const response = await request(testApp.app.getHttpServer()).get('/api/v1/no-existe');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'HTTP_404',
      message: expect.any(String),
      correlationId: expect.any(String),
    });
  });
});
