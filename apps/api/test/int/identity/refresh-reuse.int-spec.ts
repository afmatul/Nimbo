import { errorResponseSchema, REFRESH_ROTATION_GRACE_SECONDS } from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK } from '../../../src/shared';
import type { TestApp } from '../setup/test-app';

import { cookieHeader, REFRESH_PATH, setCookie, signIn } from './accounts';
import { createIdentityTestApp, firstMessageTo } from './identity-test-app';

const MS_PER_SECOND = 1000;
const GRACE_MS = REFRESH_ROTATION_GRACE_SECONDS * MS_PER_SECOND;

/** Reúso del token de refresco y gracia de la rotación (D-3, CA-9). */
describe('POST /auth/session/refresh: reúso y gracia (CA-9)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();
  const refresh = (refreshToken: string) =>
    request(server())
      .post(REFRESH_PATH)
      .set('Cookie', cookieHeader({ nimbo_rt: refreshToken }));

  const codeOf = (body: unknown): string => errorResponseSchema.parse(body).code;

  /** Inicia sesión y rota una vez: devuelve el token anterior y el vigente. */
  const signInAndRotate = async () => {
    const signedIn = await signIn(server(), dataSource);
    const response = await refresh(signedIn.refreshToken).expect(200);
    const current = setCookie(response.headers, 'nimbo_rt')?.value ?? '';
    return { ...signedIn, previous: signedIn.refreshToken, current };
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-9: el anterior pasada la gracia revoca la sesión, ningún token sirve y el dueño recibe el aviso', async () => {
    const { account, previous, current } = await signInAndRotate();
    clock.advance(GRACE_MS + MS_PER_SECOND);

    const reused = await refresh(previous);

    expect(reused.status).toBe(401);
    expect(codeOf(reused.body)).toBe('IDENTITY_SESSION_REVOKED');
    expect(setCookie(reused.headers, 'nimbo_rt')?.value).toBe('');
    expect(codeOf((await refresh(current)).body)).toBe('IDENTITY_SESSION_REVOKED');
    await expect(
      firstMessageTo(account.email, 'Cerramos una sesión por seguridad'),
    ).resolves.toBeDefined();
  });

  it('CA-9: el anterior dentro de la gracia → `IDENTITY_REFRESH_INVALID` sin revocar ni borrar la cookie', async () => {
    const { previous, current } = await signInAndRotate();
    clock.advance(GRACE_MS / 2);

    const withinGrace = await refresh(previous);

    expect(withinGrace.status).toBe(401);
    expect(codeOf(withinGrace.body)).toBe('IDENTITY_REFRESH_INVALID');
    expect(withinGrace.headers['set-cookie']).toBeUndefined();
    await refresh(current).expect(200);
  });

  it('CA-9: dos renovaciones simultáneas con el mismo token → una rota y la otra cae en la gracia', async () => {
    const { refreshToken } = await signIn(server(), dataSource);

    const responses = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 401]);
    const rejected = responses.find((response) => response.status === 401);
    expect(codeOf(rejected?.body)).toBe('IDENTITY_REFRESH_INVALID');
    expect(rejected?.headers['set-cookie']).toBeUndefined();
  });
});
