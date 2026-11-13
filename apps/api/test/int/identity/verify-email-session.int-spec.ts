import { randomUUID } from 'node:crypto';

import { sessionResponseSchema, verifyEmailResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { SessionService } from '../../../src/modules/identity/application/session.service';
import { deleteAll } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';

import { cookieHeader, LOGIN_PATH, setCookie } from './accounts';
import { newDeviceEventsFor, newDeviceMailsEnqueuedFor } from './device-mail-logs';
import {
  createIdentityTestApp,
  validRegistration,
  verificationTokenSentTo,
} from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';

/** 002 CA-15: la apertura que verifica el correo abre sesión (plan §6.5, 001 §6.11). */
describe('POST /auth/verify-email abre sesión (CA-15)', () => {
  let testApp: TestApp | undefined;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    (testApp as TestApp).app.getHttpServer();

  /** Registra un correo nuevo (con el plan elegido, si lo hay) y devuelve el token de su enlace. */
  const registeredToken = async (planSlug?: string): Promise<{ email: string; token: string }> => {
    const email = `verifica-${randomUUID()}@nimbo.me`;
    const registration = {
      ...validRegistration(email),
      ...(planSlug === undefined ? {} : { planSlug }),
    };
    await request(server()).post(REGISTER).send(registration).expect(202);
    return { email, token: await verificationTokenSentTo(email) };
  };

  const verify = (token: string) =>
    request(server()).post(VERIFY_EMAIL).set('User-Agent', USER_AGENT).send({ token });

  const sessionsOf = async (userId: string) =>
    (await (testApp as TestApp).app
      .get(DataSource)
      .query('SELECT id, dispositivo_id FROM sesion WHERE usuario_id = $1 ORDER BY creada_en', [
        userId,
      ])) as { id: string; dispositivo_id: string }[];

  beforeAll(async () => {
    await deleteAll();
  });

  afterEach(async () => {
    await testApp?.close();
    testApp = undefined;
  });

  it('CA-15: `verified` trae la sesión y las cookies `nimbo_rt` y `nimbo_did`; la segunda apertura no', async () => {
    testApp = await createIdentityTestApp();
    const { email, token } = await registeredToken();

    const first = await verify(token);

    expect(first.status).toBe(200);
    const body = verifyEmailResponseSchema.parse(first.body);
    expect(body.status).toBe('verified');
    expect(body.status === 'verified' ? body.session?.user.email : undefined).toBe(email);
    expect(setCookie(first.headers, 'nimbo_rt')).toBeDefined();
    expect(setCookie(first.headers, 'nimbo_did')).toBeDefined();

    const second = await verify(token);

    expect(second.body).toEqual({ status: 'already-verified' });
    expect(second.headers['set-cookie']).toBeUndefined();
  });

  it('registro con plan: la sesión de la verificación y la del inicio de sesión traen el plan pendiente', async () => {
    testApp = await createIdentityTestApp();
    const { email, token } = await registeredToken('pro');

    const verified = verifyEmailResponseSchema.parse((await verify(token)).body);
    const login = await request(server())
      .post(LOGIN_PATH)
      .send({ email, password: validRegistration(email).password })
      .expect(200);

    expect(
      verified.status === 'verified' ? verified.session?.user.pendingPlanSlug : undefined,
    ).toBe('pro');
    expect(sessionResponseSchema.parse(login.body).user.pendingPlanSlug).toBe('pro');
  });

  it('CA-15: si abrir la sesión falla, responde `verified` sin sesión ni cookies y lo registra', async () => {
    const failingSessions = {
      open: (): Promise<never> => Promise.reject(new Error('sesión no disponible')),
    };
    testApp = await createIdentityTestApp({
      overrides: [{ provide: SessionService, useValue: failingSessions }],
    });
    const { token } = await registeredToken();

    const response = await verify(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'verified' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(testApp.logs.lines().map((line) => line['event'])).toContain(
      'identity.verification.session_failed',
    );
  });

  it('CA-15: la apertura entrega las credenciales de CA-1 ligadas a una sesión y un dispositivo de la cuenta', async () => {
    testApp = await createIdentityTestApp();
    const { email, token } = await registeredToken();

    const response = await verify(token);

    expect(response.headers['cache-control']).toBe('no-store');
    const body = verifyEmailResponseSchema.parse(response.body);
    const session = sessionResponseSchema.parse(
      body.status === 'verified' ? body.session : undefined,
    );
    expect(session.user).toMatchObject({ email, role: 'CLIENT' });
    const refresh = setCookie(response.headers, 'nimbo_rt');
    expect(refresh?.attributes).toEqual(
      expect.arrayContaining(['httponly', 'samesite=strict', 'path=/api/v1/auth/session']),
    );
    expect(setCookie(response.headers, 'nimbo_did')?.attributes).toContain('httponly');
    const rows = await sessionsOf(session.user.id);
    expect(rows.map((row) => row.id)).toEqual([refresh?.value.split('.')[0]]);
  });

  it('CA-15: el navegador de la verificación queda conocido: un inicio de sesión posterior desde él no avisa', async () => {
    testApp = await createIdentityTestApp();
    const { email, token } = await registeredToken();
    const verified = await verify(token).expect(200);
    const deviceSecret = setCookie(verified.headers, 'nimbo_did')?.value ?? '';
    const body = verifyEmailResponseSchema.parse(verified.body);
    const userId = (body.status === 'verified' ? body.session?.user.id : undefined) ?? '';

    const login = await request(server())
      .post(LOGIN_PATH)
      .set('User-Agent', USER_AGENT)
      .set('Cookie', cookieHeader({ nimbo_did: deviceSecret }))
      .send({ email, password: validRegistration(email).password });

    expect(login.status).toBe(200);
    expect(setCookie(login.headers, 'nimbo_did')).toBeUndefined();
    const rows = await sessionsOf(userId);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.dispositivo_id)).size).toBe(1);
    expect(newDeviceEventsFor(testApp.logs, userId)).toEqual([]);
    expect(newDeviceMailsEnqueuedFor(testApp.logs, userId)).toEqual([]);
    expect(testApp.logs.lines()).toContainEqual(
      expect.objectContaining({ event: 'identity.login.succeeded', userId, newDevice: false }),
    );
  });
});
