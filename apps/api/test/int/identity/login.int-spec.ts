import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  errorResponseSchema,
  SUPPORT_CONTACT_EMAIL,
  sessionResponseSchema,
} from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import type { TestApp } from '../setup/test-app';

import { ACCOUNT_PASSWORD, cookieHeader, insertAccount, LOGIN_PATH, setCookie } from './accounts';
import { createIdentityTestApp } from './identity-test-app';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0';
const WRONG_PASSWORD = 'Otra-Clave-Incorrecta-1';

interface Observed {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, unknown>>;
}

/** Todo lo visible de la respuesta salvo `date`: con el mismo `x-correlation-id`, el resto debe coincidir. */
const observe = (response: Response): Observed => {
  const { date: _date, ...headers } = response.headers as Record<string, unknown>;
  return { status: response.status, body: response.body as unknown, headers };
};

/** `POST /auth/login` de punta a punta (plan §5, CA-1 a CA-4). */
describe('POST /auth/login (CA-1 a CA-4)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;
  let nextIp = 0;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();

  /** Cada prueba usa su IP para no sumar intentos al límite por IP (CA-6), que tiene su propia suite. */
  const login = (
    email: string,
    password: string = ACCOUNT_PASSWORD,
    extra: { readonly cookie?: string; readonly correlationId?: string } = {},
  ) => {
    nextIp += 1;
    let call = request(server())
      .post(LOGIN_PATH)
      .set('User-Agent', USER_AGENT)
      .set('X-Forwarded-For', `198.51.100.${String(nextIp)}`);
    if (extra.cookie !== undefined) call = call.set('Cookie', extra.cookie);
    if (extra.correlationId !== undefined) call = call.set('X-Correlation-Id', extra.correlationId);
    return call.send({ email, password });
  };

  const sessionRows = async (userId: string) =>
    (await dataSource.query(
      `SELECT s.id, s.dispositivo_id, s.revocada_en, d.usuario_id AS dueno_dispositivo
         FROM sesion s JOIN dispositivo d ON d.id = s.dispositivo_id
        WHERE s.usuario_id = $1`,
      [userId],
    )) as {
      id: string;
      dispositivo_id: string;
      revocada_en: Date | null;
      dueno_dispositivo: string;
    }[];

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

  it('CA-1: el token de acceso dura 900 s, con `rol` y sin el correo', async () => {
    const account = await insertAccount(dataSource);

    const body = sessionResponseSchema.parse((await login(account.email)).body);
    const payload = new JwtService().decode<Record<string, unknown>>(body.accessToken);

    expect(Number(payload['exp']) - Number(payload['iat'])).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(payload['sub']).toBe(account.id);
    expect(payload['rol']).toBe('CLIENT');
    expect(JSON.stringify(payload)).not.toContain(account.email);
    expect(new Date(body.accessTokenExpiresAt).getTime()).toBe(Number(payload['exp']) * 1000);
  });

  it('CA-1: `nimbo_rt` lleva HttpOnly, SameSite=Strict y la ruta de sesión; la fila de `sesion` va ligada al dispositivo', async () => {
    const account = await insertAccount(dataSource);

    const response = await login(account.email);

    const refresh = setCookie(response.headers, 'nimbo_rt');
    expect(refresh?.attributes).toEqual(
      expect.arrayContaining(['httponly', 'samesite=strict', 'path=/api/v1/auth/session']),
    );
    expect(refresh?.attributes).not.toContain('secure');
    const rows = await sessionRows(account.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(refresh?.value.split('.')[0]);
    expect(rows[0]?.dueno_dispositivo).toBe(account.id);
  });

  it('CA-1: `nimbo_did` solo se emite si el navegador no la traía, y el dispositivo se reconoce', async () => {
    const account = await insertAccount(dataSource);
    const first = await login(account.email);
    const device = setCookie(first.headers, 'nimbo_did')?.value ?? '';

    const second = await login(account.email, ACCOUNT_PASSWORD, {
      cookie: cookieHeader({ nimbo_did: device }),
    });

    expect(second.status).toBe(200);
    expect(setCookie(second.headers, 'nimbo_did')).toBeUndefined();
    const rows = await sessionRows(account.id);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.dispositivo_id)).size).toBe(1);
    // Un navegador, una sesión: la segunda reemplaza a la primera en vez de sumarse a «Seguridad».
    expect(rows.filter((row) => row.revocada_en === null).map((row) => row.id)).toEqual([
      (setCookie(second.headers, 'nimbo_rt')?.value ?? '').split('.')[0],
    ]);
  });

  it('CA-2: correo inexistente y contraseña incorrecta responden igual, sin cookies', async () => {
    const account = await insertAccount(dataSource);
    const correlationId = `login-ca2-${randomUUID()}`;

    const unknown = observe(
      await login(`nadie-${randomUUID()}@nimbo.me`, WRONG_PASSWORD, { correlationId }),
    );
    const wrong = observe(await login(account.email, WRONG_PASSWORD, { correlationId }));

    expect(unknown.status).toBe(401);
    expect(errorResponseSchema.parse(unknown.body).code).toBe('IDENTITY_INVALID_CREDENTIALS');
    expect(wrong).toEqual(unknown);
    expect(Object.keys(wrong.headers)).not.toContain('set-cookie');
  });

  it.each([
    ['no verificada', { verified: false }, 'IDENTITY_EMAIL_NOT_VERIFIED'],
    ['suspendida', { status: 'suspendida' as const }, 'IDENTITY_ACCOUNT_SUSPENDED'],
  ])(
    'CA-3, CA-4: cuenta %s con la contraseña correcta → `403` con su código y sin cookies',
    async (_case, options, code) => {
      const account = await insertAccount(dataSource, options);

      const response = await login(account.email);

      expect(response.status).toBe(403);
      const body = errorResponseSchema.parse(response.body);
      expect(body.code).toBe(code);
      if (code === 'IDENTITY_ACCOUNT_SUSPENDED')
        expect(body.message).toContain(SUPPORT_CONTACT_EMAIL);
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it.each([
    ['no verificada', { verified: false }],
    ['suspendida', { status: 'suspendida' as const }],
  ])('CA-2: cuenta %s con la contraseña incorrecta → como CA-2', async (_case, options) => {
    const account = await insertAccount(dataSource, options);

    const response = await login(account.email, WRONG_PASSWORD);

    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).code).toBe('IDENTITY_INVALID_CREDENTIALS');
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
