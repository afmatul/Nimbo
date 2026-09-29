import { Module } from '@nestjs/common';
import type { INestApplication, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Logger } from 'nestjs-pino';
import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';

import { DomainExceptionFilter } from '../../../shared';
import { RegistrationService } from '../application/registration.service';
import type { VerifyEmailResult } from '../application/registration.service';
import { IdentityModule } from '../identity.module';

import { AuthController } from './auth.controller';
import {
  IDENTITY_THROTTLERS,
  REGISTER_IP_THROTTLER,
  RESEND_IP_THROTTLER,
} from './identity-ip-throttler.guard';

const EMAIL = 'lucia@ejemplo.com';
const REGISTRATION = {
  fullName: 'Lucía Pérez',
  email: EMAIL,
  password: 'Nimbo-Seguro-2026',
  acceptTerms: true,
};
const TOKEN = 'a'.repeat(43);

/**
 * `AuthController` con el servicio sustituido (plan §6.5): rutas, validación con la fábrica de `identity`, mapeo del
 * resultado al contrato y `Cache-Control: no-store` en toda respuesta (el *middleware* que instala
 * `IdentityModule.configure`). De punta a punta lo cubren `test/int/identity/*.int-spec.ts`.
 */
describe('AuthController', () => {
  let app: INestApplication;
  const service = {
    register: jest.fn<Promise<void>, unknown[]>(),
    resendVerification: jest.fn<Promise<void>, unknown[]>(),
    verifyEmail: jest.fn<Promise<VerifyEmailResult>, unknown[]>(),
  };

  /** El controlador con los *middlewares* de `IdentityModule`, sin sus adaptadores de infraestructura. */
  @Module({
    imports: [ThrottlerModule.forRoot({ throttlers: [...IDENTITY_THROTTLERS] })],
    controllers: [AuthController],
    providers: [
      { provide: RegistrationService, useValue: service },
      { provide: PinoLogger, useValue: { info: jest.fn(), warn: jest.fn() } },
    ],
  })
  class AuthControllerTestModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      new IdentityModule().configure(consumer);
    }
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    service.register.mockResolvedValue(undefined);
    service.resendVerification.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [AuthControllerTestModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(
      new DomainExceptionFilter({ warn: jest.fn(), error: jest.fn() } as unknown as Logger),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(`/auth/${path}`).send(body);

  it('CA-1: `register` delega sin `acceptTerms` y responde `202 accepted` sin caché ni cookies', async () => {
    const response = await post('register', REGISTRATION);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ status: 'accepted' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(service.register).toHaveBeenCalledWith({
      fullName: 'Lucía Pérez',
      email: EMAIL,
      password: 'Nimbo-Seguro-2026',
    });
  });

  it('CA-5: una contraseña débil responde `IDENTITY_WEAK_PASSWORD` sin llamar al servicio', async () => {
    const response = await post('register', { ...REGISTRATION, password: 'corta' });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'IDENTITY_WEAK_PASSWORD' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(service.register).not.toHaveBeenCalled();
  });

  it('CA-7: un campo no declarado responde `IDENTITY_INVALID_INPUT` sin llamar al servicio', async () => {
    const response = await post('register', { ...REGISTRATION, rol: 'ADMIN' });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      code: 'IDENTITY_INVALID_INPUT',
      fields: [expect.objectContaining({ field: 'rol', reason: 'UNKNOWN_FIELD' })],
    });
    expect(service.register).not.toHaveBeenCalled();
  });

  it('CA-13: `resend-verification` delega y responde `202 accepted` sin caché', async () => {
    const response = await post('resend-verification', { email: EMAIL });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ status: 'accepted' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(service.resendVerification).toHaveBeenCalledWith({ email: EMAIL });
  });

  it.each([
    [{ outcome: 'VERIFIED', userId: 'u-1' } as const, 'verified'],
    [{ outcome: 'ALREADY_VERIFIED' } as const, 'already-verified'],
  ])(
    'CA-8, CA-10: `verify-email` mapea %j a `200 %s` sin caché',
    async (result: VerifyEmailResult, status: string) => {
      service.verifyEmail.mockResolvedValue(result);

      const response = await post('verify-email', { token: TOKEN });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(service.verifyEmail).toHaveBeenCalledWith(TOKEN);
    },
  );

  const limitOf = (name: string): number =>
    Number(IDENTITY_THROTTLERS.find((throttler) => throttler.name === name)?.limit);

  it.each([
    ['register', REGISTER_IP_THROTTLER, 'resend-verification'],
    ['resend-verification', RESEND_IP_THROTTLER, 'register'],
  ] as const)(
    'CA-15: `%s` tiene su propio límite por IP (`%s`) y no consume el de `%s`',
    async (route, throttler, otherRoute) => {
      const bodies = { register: REGISTRATION, 'resend-verification': { email: EMAIL } };
      for (let attempt = 1; attempt <= limitOf(throttler); attempt += 1) {
        await post(route, bodies[route]).expect(202);
      }

      const blocked = await post(route, bodies[route]);
      const other = await post(otherRoute, bodies[otherRoute]);

      expect(blocked.status).toBe(429);
      expect(blocked.body).toMatchObject({ code: 'IDENTITY_TOO_MANY_REQUESTS' });
      expect(blocked.headers['cache-control']).toBe('no-store');
      expect(other.status).toBe(202);
    },
  );
});
