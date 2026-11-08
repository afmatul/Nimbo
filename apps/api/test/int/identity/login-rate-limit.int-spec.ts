import { randomUUID } from 'node:crypto';

import {
  errorResponseSchema,
  LOGIN_ATTEMPTS_PER_IP,
  REGISTRATIONS_PER_IP_PER_HOUR,
} from '@nimbo/contracts';
import request from 'supertest';

import { I_ATTEMPT_LOCKOUT, I_PASSWORD_HASHER } from '../../../src/shared';
import type { IAttemptLockout, IPasswordHasher } from '../../../src/shared';
import type { TestApp } from '../setup/test-app';

import { LOGIN_PATH } from './accounts';
import { createIdentityTestApp, validRegistration } from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
const WRONG_PASSWORD = 'Otra-Clave-Incorrecta-1';
const RATE_LIMIT_HEADER = /^x-ratelimit-/i;

/** Límite por IP del inicio de sesión y `@SkipThrottle` cruzados con el registro (D-5, DT-20, CA-6). */
describe('POST /auth/login: límite por IP (CA-6)', () => {
  let testApp: TestApp;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();
  const login = (ip: string) =>
    request(server())
      .post(LOGIN_PATH)
      .set('X-Forwarded-For', ip)
      .send({ email: `nadie-${randomUUID()}@nimbo.me`, password: WRONG_PASSWORD });
  const register = (ip: string) =>
    request(server())
      .post(REGISTER)
      .set('X-Forwarded-For', ip)
      .send(validRegistration(`registro-${randomUUID()}@nimbo.me`));

  beforeAll(async () => {
    testApp = await createIdentityTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('CA-6: el intento 21 desde una IP → `429 IDENTITY_TOO_MANY_REQUESTS` sin tocar el bloqueo ni el hasher', async () => {
    const ip = '203.0.113.21';
    for (let attempt = 1; attempt <= LOGIN_ATTEMPTS_PER_IP; attempt += 1) {
      expect((await login(ip)).status).toBe(401);
    }
    const lockout = testApp.app.get<IAttemptLockout>(I_ATTEMPT_LOCKOUT);
    const hasher = testApp.app.get<IPasswordHasher>(I_PASSWORD_HASHER);
    const check = jest.spyOn(lockout, 'check');
    const verify = jest.spyOn(hasher, 'verify');

    const response = await login(ip);

    expect(response.status).toBe(429);
    const body = errorResponseSchema.parse(response.body);
    expect(body.code).toBe('IDENTITY_TOO_MANY_REQUESTS');
    expect(body.message).toBe(
      'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
    );
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(Object.keys(response.headers).filter((name) => RATE_LIMIT_HEADER.test(name))).toEqual(
      [],
    );
    expect(check).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    // Los inicios de sesión no consumen `register-ip`: el registro desde esa IP sigue aceptado.
    await register(ip).expect(202);
  });

  it('CA-6: los registros no consumen `login-ip`: con `register-ip` agotado, el inicio de sesión sigue evaluándose', async () => {
    const ip = '203.0.113.22';
    for (let attempt = 1; attempt <= REGISTRATIONS_PER_IP_PER_HOUR; attempt += 1) {
      await register(ip).expect(202);
    }
    await register(ip).expect(429);

    const response = await login(ip);

    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).code).toBe('IDENTITY_INVALID_CREDENTIALS');
  });
});
