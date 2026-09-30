import { errorResponseSchema, sessionResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK } from '../../../src/shared';
import type { TestApp } from '../setup/test-app';

import { cookieHeader, REFRESH_PATH, setCookie, signIn } from './accounts';
import { createIdentityTestApp } from './identity-test-app';

const MS_PER_SECOND = 1000;
const SECONDS_PER_DAY = 86_400;
const MS_PER_DAY = SECONDS_PER_DAY * MS_PER_SECOND;
const MAX_LIFETIME_DAYS = 30;

interface SessionRow {
  ultimo_uso: Date;
  revocada_en: Date | null;
}

/** `POST /auth/session/refresh` de punta a punta (plan §5; CA-7, CA-8, CA-10). */
describe('POST /auth/session/refresh (CA-7, CA-8, CA-10)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();
  const login = () => signIn(server(), dataSource);
  const refresh = (refreshToken: string) =>
    request(server())
      .post(REFRESH_PATH)
      .set('Cookie', cookieHeader({ nimbo_rt: refreshToken }));

  const sessionRow = async (sessionId: string): Promise<SessionRow> => {
    const rows = (await dataSource.query(
      'SELECT ultimo_uso, revocada_en FROM sesion WHERE id = $1',
      [sessionId],
    )) as SessionRow[];
    return rows[0] as SessionRow;
  };

  const advance = (ms: number): void => {
    clock.set(new Date(clock.now().getTime() + ms));
  };

  const maxAgeOf = (attributes: readonly string[] | undefined): number =>
    Number(attributes?.find((part) => part.startsWith('max-age='))?.slice('max-age='.length));

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-7: rota la cookie y entrega un token de acceso nuevo', async () => {
    const { account, refreshToken } = await login();
    advance(60 * MS_PER_SECOND);

    const response = await refresh(refreshToken);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(sessionResponseSchema.parse(response.body).user.id).toBe(account.id);
    const rotated = setCookie(response.headers, 'nimbo_rt');
    expect(rotated?.value).toMatch(/^[0-9a-f-]{36}\./);
    expect(rotated?.value).not.toBe(refreshToken);
    expect(rotated?.attributes).toEqual(
      expect.arrayContaining(['httponly', 'samesite=strict', 'path=/api/v1/auth/session']),
    );
  });

  it('CA-7: `ultimo_uso` avanza y el anterior fuera de la gracia ya no sirve', async () => {
    const { refreshToken, sessionId } = await login();
    advance(MS_PER_SECOND);
    await refresh(refreshToken).expect(200);

    expect((await sessionRow(sessionId)).ultimo_uso.getTime()).toBe(clock.now().getTime());
    advance(11 * MS_PER_SECOND);
    const reused = await refresh(refreshToken);

    expect(reused.status).toBe(401);
    expect(errorResponseSchema.parse(reused.body).code).toBe('IDENTITY_SESSION_REVOKED');
  });

  it('CA-8: sin uso durante 7 días y 1 s → `IDENTITY_SESSION_EXPIRED` y cookie borrada', async () => {
    const { refreshToken } = await login();
    advance(7 * MS_PER_DAY + MS_PER_SECOND);

    const response = await refresh(refreshToken);

    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).code).toBe('IDENTITY_SESSION_EXPIRED');
    const cleared = setCookie(response.headers, 'nimbo_rt');
    expect(cleared?.value).toBe('');
    expect(cleared?.attributes).toContain('path=/api/v1/auth/session');
  });

  it('CA-8: renovando a diario vence a los 30 días y 1 s; el `Max-Age` nunca pasa de lo que le queda', async () => {
    let { refreshToken } = await login();
    for (let day = 1; day < MAX_LIFETIME_DAYS; day += 1) {
      advance(MS_PER_DAY);
      const cookie = setCookie((await refresh(refreshToken).expect(200)).headers, 'nimbo_rt');
      expect(maxAgeOf(cookie?.attributes)).toBeLessThanOrEqual(
        (MAX_LIFETIME_DAYS - day) * SECONDS_PER_DAY,
      );
      refreshToken = cookie?.value ?? '';
    }
    advance(MS_PER_DAY + MS_PER_SECOND);

    const response = await refresh(refreshToken);

    expect(errorResponseSchema.parse(response.body).code).toBe('IDENTITY_SESSION_EXPIRED');
    expect(setCookie(response.headers, 'nimbo_rt')?.value).toBe('');
  });

  it('CA-10: una sesión revocada → `IDENTITY_SESSION_REVOKED` y cookie borrada', async () => {
    const { refreshToken, sessionId } = await login();
    await dataSource.query('UPDATE sesion SET revocada_en = $2 WHERE id = $1', [
      sessionId,
      clock.now(),
    ]);

    const response = await refresh(refreshToken);

    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).code).toBe('IDENTITY_SESSION_REVOKED');
    expect(setCookie(response.headers, 'nimbo_rt')?.value).toBe('');
  });

  it('CA-10: la cuenta suspendida tras iniciar sesión → `IDENTITY_SESSION_REVOKED` y `revocada_en` escrito', async () => {
    const { account, refreshToken, sessionId } = await login();
    await dataSource.query("UPDATE usuario SET estado = 'suspendida' WHERE id = $1", [account.id]);

    const response = await refresh(refreshToken);

    expect(errorResponseSchema.parse(response.body).code).toBe('IDENTITY_SESSION_REVOKED');
    expect(setCookie(response.headers, 'nimbo_rt')?.value).toBe('');
    expect((await sessionRow(sessionId)).revocada_en).not.toBeNull();
  });

  it('CA-9: sin cookie o con una mal formada → `IDENTITY_REFRESH_INVALID` sin borrar la cookie', async () => {
    const missing = await request(server()).post(REFRESH_PATH);
    const malformed = await refresh('no-es-un-token');

    for (const response of [missing, malformed]) {
      expect(response.status).toBe(401);
      expect(errorResponseSchema.parse(response.body).code).toBe('IDENTITY_REFRESH_INVALID');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });
});
