import request from 'supertest';
import { DataSource } from 'typeorm';

import type { TestApp } from '../setup/test-app';

import { cookieHeader, LOGOUT_PATH, REFRESH_PATH, setCookie, signIn } from './accounts';
import { createIdentityTestApp } from './identity-test-app';

const DEVICE_SECRET = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

/** `POST /auth/session/logout` de punta a punta (plan §5, CA-14). */
describe('POST /auth/session/logout (CA-14)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();
  const logout = (cookie?: string) => {
    const call = request(server()).post(LOGOUT_PATH);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp();
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-14: `204`, sesión revocada, `nimbo_rt` borrada y `nimbo_did` intacta', async () => {
    const { refreshToken, sessionId } = await signIn(server(), dataSource);

    const response = await logout(
      cookieHeader({ nimbo_rt: refreshToken, nimbo_did: DEVICE_SECRET }),
    );

    expect(response.status).toBe(204);
    expect(response.headers['cache-control']).toBe('no-store');
    const cleared = setCookie(response.headers, 'nimbo_rt');
    expect(cleared?.value).toBe('');
    expect(cleared?.attributes).toContain('path=/api/v1/auth/session');
    expect(setCookie(response.headers, 'nimbo_did')).toBeUndefined();
    const rows = (await dataSource.query('SELECT revocada_en FROM sesion WHERE id = $1', [
      sessionId,
    ])) as { revocada_en: Date | null }[];
    expect(rows[0]?.revocada_en).not.toBeNull();
    await request(server())
      .post(REFRESH_PATH)
      .set('Cookie', cookieHeader({ nimbo_rt: refreshToken }))
      .expect(401);
  });

  it.each([
    ['sin cookie', undefined],
    ['con una cookie alterada', cookieHeader({ nimbo_rt: 'no-es-un-token' })],
  ])('CA-14: %s → `204` y la cookie borrada', async (_case, cookie) => {
    const response = await logout(cookie);

    expect(response.status).toBe(204);
    expect(setCookie(response.headers, 'nimbo_rt')?.value).toBe('');
  });

  it('CA-14: con la cookie de una sesión ya revocada → `204`', async () => {
    const { refreshToken } = await signIn(server(), dataSource);
    await logout(cookieHeader({ nimbo_rt: refreshToken })).expect(204);

    await logout(cookieHeader({ nimbo_rt: refreshToken })).expect(204);
  });
});
