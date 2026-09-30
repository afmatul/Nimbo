import { randomUUID } from 'node:crypto';

import { errorResponseSchema, LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILURES } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK } from '../../../src/shared';
import type { TestApp } from '../setup/test-app';

import { ACCOUNT_PASSWORD, insertAccount, LOGIN_PATH } from './accounts';
import { createIdentityTestApp } from './identity-test-app';

const WRONG_PASSWORD = 'Otra-Clave-Incorrecta-1';
const LOCK_SECONDS = LOGIN_LOCK_MINUTES * 60;

/** `status`, cuerpo y cabeceras salvo `date`; con el mismo `x-correlation-id` todo lo demás coincide. */
const observe = (response: Response) => {
  const { date: _date, ...headers } = response.headers as Record<string, unknown>;
  return { status: response.status, body: response.body as unknown, headers };
};

/** Bloqueo por correo del inicio de sesión (D-5, DT-4, CA-5). El reloj es un `FixedClock` que mueve la prueba. */
describe('POST /auth/login: bloqueo por correo (CA-5)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;
  let nextIp = 0;

  /** Una IP por intento: el límite por IP (CA-6) no debe mezclarse con el de correo. */
  const login = (email: string, password: string, correlationId?: string) => {
    nextIp += 1;
    const call = request(testApp.app.getHttpServer())
      .post(LOGIN_PATH)
      .set('X-Forwarded-For', `192.0.2.${String(nextIp % 250)}`);
    return (correlationId === undefined ? call : call.set('X-Correlation-Id', correlationId)).send({
      email,
      password,
    });
  };

  const failTimes = async (email: string, times: number): Promise<void> => {
    for (let attempt = 1; attempt <= times; attempt += 1) {
      const response = await login(email, WRONG_PASSWORD);
      expect(errorResponseSchema.parse(response.body).code).toBe('IDENTITY_INVALID_CREDENTIALS');
    }
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-5: tras 5 fallos, el 6.º intento, aunque sea correcto, responde `429 IDENTITY_LOGIN_LOCKED` con `Retry-After`', async () => {
    const account = await insertAccount(dataSource);
    await failTimes(account.email, LOGIN_MAX_FAILURES);

    const response = await login(account.email, ACCOUNT_PASSWORD);

    expect(response.status).toBe(429);
    const body = errorResponseSchema.parse(response.body);
    expect(body.code).toBe('IDENTITY_LOGIN_LOCKED');
    expect(body.message).toContain(`${String(LOGIN_LOCK_MINUTES)} minutos`);
    expect(response.headers['retry-after']).toBe(String(LOCK_SECONDS));
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('CA-5: con un correo inexistente el bloqueo responde idéntico', async () => {
    const account = await insertAccount(dataSource);
    const nobody = `nadie-${randomUUID()}@nimbo.me`;
    await failTimes(account.email, LOGIN_MAX_FAILURES);
    await failTimes(nobody, LOGIN_MAX_FAILURES);
    const correlationId = `lockout-${randomUUID()}`;

    const existing = observe(await login(account.email, ACCOUNT_PASSWORD, correlationId));
    const missing = observe(await login(nobody, ACCOUNT_PASSWORD, correlationId));

    expect(existing.status).toBe(429);
    expect(missing).toEqual(existing);
  });

  it('CA-5: pasados 15 minutos vuelve a permitir el inicio de sesión', async () => {
    const account = await insertAccount(dataSource);
    await failTimes(account.email, LOGIN_MAX_FAILURES);
    await login(account.email, ACCOUNT_PASSWORD).expect(429);

    clock.advance(LOCK_SECONDS * 1000);

    await login(account.email, ACCOUNT_PASSWORD).expect(200);
  });

  it('DT-4: un inicio de sesión correcto borra los fallos previos', async () => {
    const account = await insertAccount(dataSource);
    await failTimes(account.email, LOGIN_MAX_FAILURES - 1);
    await login(account.email, ACCOUNT_PASSWORD).expect(200);

    await failTimes(account.email, LOGIN_MAX_FAILURES - 1);

    await login(account.email, ACCOUNT_PASSWORD).expect(200);
  });
});
