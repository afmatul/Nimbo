import { sessionResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import type { TestApp } from '../setup/test-app';

import { ACCOUNT_PASSWORD, insertAccount, setCookie } from './accounts';
import { createIdentityTestApp } from './identity-test-app';

const LOGIN = '/api/v1/auth/login';

/** `POST /auth/login` de punta a punta (plan §5, CA-1 a CA-4). */
describe('POST /auth/login (CA-1 a CA-4)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();
  const login = (email: string, password: string = ACCOUNT_PASSWORD) =>
    request(server())
      .post(LOGIN)
      .set('User-Agent', 'Mozilla/5.0 Firefox/130.0')
      .send({ email, password });

  beforeAll(async () => {
    testApp = await createIdentityTestApp();
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-1: responde `200` con un `SessionResponse` válido, `no-store` y las cookies `nimbo_rt` y `nimbo_did`', async () => {
    const account = await insertAccount(dataSource);

    const response = await login(account.email);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = sessionResponseSchema.parse(response.body);
    expect(body.accessTokenExpiresAt.endsWith('Z')).toBe(true);
    expect(body.user).toEqual({
      id: account.id,
      fullName: account.fullName,
      email: account.email,
      role: 'CLIENT',
    });
    expect(setCookie(response.headers, 'nimbo_rt')).toBeDefined();
    expect(setCookie(response.headers, 'nimbo_did')).toBeDefined();
  });
});
