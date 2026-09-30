import { randomUUID } from 'node:crypto';

import { verifyEmailResponseSchema } from '@nimbo/contracts';
import request from 'supertest';

import { SessionService } from '../../../src/modules/identity/application/session.service';
import { deleteAll } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';

import { setCookie } from './accounts';
import {
  createIdentityTestApp,
  validRegistration,
  verificationTokenSentTo,
} from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';

/** 002 CA-15: la apertura que verifica el correo abre sesión (plan §6.5, 001 §6.11). */
describe('POST /auth/verify-email abre sesión (CA-15)', () => {
  let testApp: TestApp | undefined;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    (testApp as TestApp).app.getHttpServer();

  /** Registra un correo nuevo y devuelve el token de su enlace. */
  const registeredToken = async (): Promise<{ email: string; token: string }> => {
    const email = `verifica-${randomUUID()}@nimbo.me`;
    await request(server()).post(REGISTER).send(validRegistration(email)).expect(202);
    return { email, token: await verificationTokenSentTo(email) };
  };

  const verify = (token: string) => request(server()).post(VERIFY_EMAIL).send({ token });

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
});
