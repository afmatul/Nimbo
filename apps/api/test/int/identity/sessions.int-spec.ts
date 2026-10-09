import { randomUUID } from 'node:crypto';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  errorResponseSchema,
  revokeOthersResponseSchema,
  sessionListResponseSchema,
  sessionResponseSchema,
  verifyEmailResponseSchema,
} from '@nimbo/contracts';
import type { SessionSummary } from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_ACCESS_TOKEN_VERIFIER, I_CLOCK } from '../../../src/shared';
import type { AccessTokenClaims, IAccessTokenVerifier } from '../../../src/shared';
import type { TestApp } from '../setup/test-app';

import {
  ACCOUNT_PASSWORD,
  cookieHeader,
  insertAccount,
  LOGIN_PATH,
  REFRESH_PATH,
  setCookie,
} from './accounts';
import type { Account } from './accounts';
import {
  createIdentityTestApp,
  validRegistration,
  verificationTokenSentTo,
} from './identity-test-app';

const SESSIONS_PATH = '/api/v1/sessions';
const REVOKE_OTHERS_PATH = `${SESSIONS_PATH}/revoke-others`;
const REGISTER_PATH = '/api/v1/auth/register';
const VERIFY_EMAIL_PATH = '/api/v1/auth/verify-email';
const UNKNOWN_SESSION_ID = '9d2f1c7a-3b4e-4f5a-8b6c-7d8e9f0a1b2c';
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_SECONDS * MS_PER_SECOND;
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';

/** Lo que un navegador guarda de su sesión: el token de acceso en memoria y `nimbo_rt` en la cookie. */
interface Browser {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly sessionId: string;
}

/**
 * «Seguridad»: `GET /sessions`, `DELETE /sessions/:id` y `POST /sessions/revoke-others` de punta a punta (plan 002
 * §5, §6.5; CA-11 a CA-14). Cada prueba usa cuentas nuevas y tokens reales del inicio de sesión. El reloj es un
 * `FixedClock` para medir la vida del token de acceso.
 */
describe('Sesiones abiertas (CA-11 a CA-14)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;
  let nextIp = 0;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();

  /** Una IP por petición limitada: los límites por IP (CA-6) tienen su propia suite. */
  const nextAddress = (): string => {
    nextIp += 1;
    return `198.51.100.${String((nextIp % 250) + 1)}`;
  };

  const signInFrom = async (account: Account, userAgent = FIREFOX_LINUX): Promise<Browser> => {
    const response = await request(server())
      .post(LOGIN_PATH)
      .set('X-Forwarded-For', nextAddress())
      .set('User-Agent', userAgent)
      .send({ email: account.email, password: ACCOUNT_PASSWORD })
      .expect(200);
    const refreshToken = setCookie(response.headers, 'nimbo_rt')?.value ?? '';
    const { accessToken } = sessionResponseSchema.parse(response.body);
    return { accessToken, refreshToken, sessionId: refreshToken.split('.')[0] ?? '' };
  };

  const authorized = (call: request.Test, browser?: Browser): request.Test =>
    browser === undefined ? call : call.set('Authorization', `Bearer ${browser.accessToken}`);

  const listSessions = (browser?: Browser) =>
    authorized(request(server()).get(SESSIONS_PATH), browser);

  const closeSession = (sessionId: string, browser?: Browser) =>
    authorized(request(server()).delete(`${SESSIONS_PATH}/${sessionId}`), browser);

  const revokeOthers = (browser?: Browser) =>
    authorized(request(server()).post(REVOKE_OTHERS_PATH), browser);

  /** `200` y la lista validada contra el contrato. */
  const listedBy = async (browser: Browser): Promise<readonly SessionSummary[]> => {
    const response = await listSessions(browser).expect(200);
    return sessionListResponseSchema.parse(response.body).items;
  };

  const refresh = (browser: Browser) =>
    request(server())
      .post(REFRESH_PATH)
      .set('Cookie', cookieHeader({ nimbo_rt: browser.refreshToken }));

  const codeOf = (body: unknown): string => errorResponseSchema.parse(body).code;

  /** Registra una cuenta nueva y abre el enlace de verificación desde Safari en macOS (CA-15). */
  const verifiedBrowser = async (): Promise<Browser> => {
    const email = `sesiones-${randomUUID()}@nimbo.me`;
    await request(server())
      .post(REGISTER_PATH)
      .set('X-Forwarded-For', nextAddress())
      .send(validRegistration(email))
      .expect(202);
    const response = await request(server())
      .post(VERIFY_EMAIL_PATH)
      .set('User-Agent', SAFARI_MAC)
      .send({ token: await verificationTokenSentTo(email) })
      .expect(200);
    const verified = verifyEmailResponseSchema.parse(response.body);
    const accessToken = verified.status === 'verified' ? verified.session?.accessToken : undefined;
    const refreshToken = setCookie(response.headers, 'nimbo_rt')?.value ?? '';
    return {
      accessToken: accessToken ?? '',
      refreshToken,
      sessionId: refreshToken.split('.')[0] ?? '',
    };
  };

  const revokedAt = async (sessionId: string): Promise<Date | null> => {
    const [row] = (await dataSource.query('SELECT revocada_en FROM sesion WHERE id = $1', [
      sessionId,
    ])) as { revocada_en: Date | null }[];
    if (row === undefined) throw new Error('La sesión de la prueba no existe.');
    return row.revocada_en;
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('caminos felices y autenticación (T-73)', () => {
    it('CA-11: `GET /sessions` → `200` con la sesión actual y `Cache-Control: no-store`', async () => {
      const browser = await signInFrom(await insertAccount(dataSource));

      const response = await listSessions(browser).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      const { items } = sessionListResponseSchema.parse(response.body);
      expect(items).toEqual([
        expect.objectContaining({ id: browser.sessionId, current: true }) as SessionSummary,
      ]);
    });

    it('CA-12: `DELETE /sessions/:id` de otra sesión propia → `204` y la sesión queda revocada', async () => {
      const account = await insertAccount(dataSource);
      const current = await signInFrom(account);
      const other = await signInFrom(account);

      const response = await closeSession(other.sessionId, current).expect(204);

      expect(setCookie(response.headers, 'nimbo_rt')).toBeUndefined();
      expect(await revokedAt(other.sessionId)).not.toBeNull();
      expect(await revokedAt(current.sessionId)).toBeNull();
    });

    it('CA-13: `POST /sessions/revoke-others` → `200` con `revokedCount`', async () => {
      const account = await insertAccount(dataSource);
      const current = await signInFrom(account);
      const other = await signInFrom(account);

      const response = await revokeOthers(current).expect(200);

      expect(revokeOthersResponseSchema.parse(response.body)).toEqual({ revokedCount: 1 });
      expect(await revokedAt(other.sessionId)).not.toBeNull();
    });

    it.each([
      ['GET /sessions', () => listSessions()],
      ['DELETE /sessions/:id', () => closeSession('9d2f1c7a-3b4e-4f5a-8b6c-7d8e9f0a1b2c')],
      ['POST /sessions/revoke-others', () => revokeOthers()],
    ])('sin token, %s → `401 SHARED_UNAUTHENTICATED`', async (_route, call) => {
      const response = await call();

      expect(response.status).toBe(401);
      expect(errorResponseSchema.parse(response.body).code).toBe('SHARED_UNAUTHENTICATED');
    });
  });

  describe('lista y «cerrar las demás» (T-75)', () => {
    /** Deja la sesión vencida por inactividad (más de 7 días sin uso) sin romper `ck_sesion_vigencia`. */
    const expireByIdleness = async (sessionId: string): Promise<void> => {
      await dataSource.query(
        `UPDATE sesion SET creada_en = creada_en - interval '8 days', ultimo_uso = ultimo_uso - interval '8 days'
         WHERE id = $1`,
        [sessionId],
      );
    };

    /** Hashes e identificadores de dispositivo de la cuenta: nada de esto puede salir en la lista. */
    const secretsOf = async (userId: string): Promise<readonly string[]> => {
      const rows = (await dataSource.query(
        `SELECT s.refresh_hash, s.dispositivo_id, d.huella_hash
         FROM sesion s JOIN dispositivo d ON d.id = s.dispositivo_id WHERE s.usuario_id = $1`,
        [userId],
      )) as { refresh_hash: string; dispositivo_id: string; huella_hash: string }[];
      return rows.flatMap((row) => [row.refresh_hash, row.dispositivo_id, row.huella_hash]);
    };

    /** Inicia sesión y adelanta el reloj un minuto: cada sesión tiene su propia última actividad. */
    const signInAndWait = async (account: Account, userAgent: string) => {
      const startedAt = clock.now().toISOString();
      const browser = await signInFrom(account, userAgent);
      clock.advance(MS_PER_MINUTE);
      return { browser, startedAt };
    };

    type Opened = Awaited<ReturnType<typeof signInAndWait>>;
    type AgentSummary = Pick<SessionSummary, 'browser' | 'os' | 'deviceKind'>;

    const CHROME_ON_WINDOWS: AgentSummary = {
      browser: 'Chrome',
      os: 'Windows',
      deviceKind: 'desktop',
    };
    const SAFARI_ON_IPHONE: AgentSummary = { browser: 'Safari', os: 'iOS', deviceKind: 'mobile' };
    const FIREFOX_ON_LINUX: AgentSummary = {
      browser: 'Firefox',
      os: 'Linux',
      deviceKind: 'desktop',
    };

    /** Forma exacta de `SessionSummary`: un campo de más (IP, agente completo, dispositivo) hace fallar `toEqual`. */
    const expectedSummary = (
      opened: Opened,
      agent: AgentSummary,
      current: boolean,
    ): SessionSummary => ({
      id: opened.browser.sessionId,
      ...agent,
      startedAt: opened.startedAt,
      lastActiveAt: opened.startedAt,
      current,
    });

    it('CA-11: solo las vigentes de la cuenta, la actual primero y después por última actividad, sin datos internos', async () => {
      const account = await insertAccount(dataSource);
      const chrome = await signInAndWait(account, CHROME_WINDOWS);
      const firefox = await signInAndWait(account, FIREFOX_LINUX);
      const safari = await signInAndWait(account, SAFARI_IPHONE);
      const revoked = await signInFrom(account);
      const expired = await signInFrom(account);
      await signInFrom(await insertAccount(dataSource), CHROME_WINDOWS);
      await closeSession(revoked.sessionId, chrome.browser).expect(204);
      await expireByIdleness(expired.sessionId);

      const response = await listSessions(chrome.browser).expect(200);

      expect(response.body).toEqual({
        items: [
          expectedSummary(chrome, CHROME_ON_WINDOWS, true),
          expectedSummary(safari, SAFARI_ON_IPHONE, false),
          expectedSummary(firefox, FIREFOX_ON_LINUX, false),
        ],
      });
      const serialized = JSON.stringify(response.body);
      for (const secret of [...(await secretsOf(account.id)), 'Mozilla', '198.51.100.']) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('CA-13: con cuatro sesiones, `revoke-others` → `revokedCount = 3` y la actual sigue renovando', async () => {
      const account = await insertAccount(dataSource);
      const current = await signInFrom(account);
      const others = [
        await signInFrom(account),
        await signInFrom(account),
        await signInFrom(account),
      ];

      const response = await revokeOthers(current).expect(200);

      expect(response.body).toEqual({ revokedCount: 3 });
      for (const other of others) {
        expect(await revokedAt(other.sessionId)).not.toBeNull();
        expect(codeOf((await refresh(other)).body)).toBe('IDENTITY_SESSION_REVOKED');
      }
      await refresh(current).expect(200);
      expect(await listedBy(current)).toEqual([
        expect.objectContaining({ id: current.sessionId, current: true }) as SessionSummary,
      ]);
    });

    it('CA-15: la sesión abierta al verificar el correo aparece en la lista y se puede cerrar', async () => {
      const verified = await verifiedBrowser();

      expect(await listedBy(verified)).toEqual([
        expect.objectContaining({
          id: verified.sessionId,
          browser: 'Safari',
          os: 'macOS',
          current: true,
        }) as SessionSummary,
      ]);
      await closeSession(verified.sessionId, verified).expect(204);
      expect(await revokedAt(verified.sessionId)).not.toBeNull();
    });
  });

  describe('cerrar una sesión desde la lista (T-76)', () => {
    const errorOf = (body: unknown) => {
      const { code, message, fields, details } = errorResponseSchema.parse(body);
      return { code, message, fields, details };
    };

    it('CA-12: el refresco de la sesión cerrada falla al instante y borra su cookie', async () => {
      const account = await insertAccount(dataSource);
      const current = await signInFrom(account);
      const other = await signInFrom(account);

      await closeSession(other.sessionId, current).expect(204);

      const response = await refresh(other);
      expect(response.status).toBe(401);
      expect(codeOf(response.body)).toBe('IDENTITY_SESSION_REVOKED');
      expect(setCookie(response.headers, 'nimbo_rt')?.value).toBe('');
    });

    it('CA-12: su token de acceso verifica hasta que vence a los 15 min y después no', async () => {
      const account = await insertAccount(dataSource);
      const current = await signInFrom(account);
      const other = await signInFrom(account);
      const verifier = testApp.app.get<IAccessTokenVerifier>(I_ACCESS_TOKEN_VERIFIER);
      await closeSession(other.sessionId, current).expect(204);

      clock.advance(ACCESS_TOKEN_TTL_MS - MS_PER_SECOND);
      const beforeExpiry = await verifier.verify(other.accessToken);
      clock.advance(2 * MS_PER_SECOND);
      const afterExpiry = await verifier.verify(other.accessToken);

      expect(beforeExpiry).toEqual({
        valid: true,
        claims: expect.objectContaining({ sessionId: other.sessionId }) as AccessTokenClaims,
      });
      expect(afterExpiry).toEqual({ valid: false, reason: 'expired' });
    });

    it('CA-14: cerrar la sesión actual → `204`, `nimbo_rt` borrada y la sesión ya no renueva', async () => {
      const current = await signInFrom(await insertAccount(dataSource));

      const response = await closeSession(current.sessionId, current).expect(204);

      const cleared = setCookie(response.headers, 'nimbo_rt');
      expect(cleared?.value).toBe('');
      expect(cleared?.attributes).toContain('path=/api/v1/auth/session');
      expect(setCookie(response.headers, 'nimbo_did')).toBeUndefined();
      expect(codeOf((await refresh(current)).body)).toBe('IDENTITY_SESSION_REVOKED');
    });

    it('CA-12: `id` mal formado, inexistente, ajeno o ya cerrado → el mismo `404` y nada cambia', async () => {
      const account = await insertAccount(dataSource);
      const current = await signInFrom(account);
      const closed = await signInFrom(account);
      await closeSession(closed.sessionId, current).expect(204);
      const foreign = await signInFrom(await insertAccount(dataSource));

      // En serie: cuatro DELETE a la vez cortan el socket en CI (`read ECONNRESET`).
      const responses = [
        await closeSession('no-es-un-uuid', current),
        await closeSession(UNKNOWN_SESSION_ID, current),
        await closeSession(foreign.sessionId, current),
        await closeSession(closed.sessionId, current),
      ];

      const [malformed, ...rest] = responses.map((response) => ({
        status: response.status,
        error: errorOf(response.body),
      }));
      expect(malformed).toEqual({
        status: 404,
        error: expect.objectContaining({ code: 'IDENTITY_SESSION_NOT_FOUND' }) as object,
      });
      rest.forEach((response) => expect(response).toEqual(malformed));
      expect(await revokedAt(foreign.sessionId)).toBeNull();
    });
  });
});
