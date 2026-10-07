import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  LOGIN_ATTEMPTS_PER_IP,
  LOGIN_MAX_FAILURES,
  PASSWORD_CHANGE_MAX_FAILURES,
  REFRESH_ROTATION_GRACE_SECONDS,
  SESSION_IDLE_TIMEOUT_DAYS,
} from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK } from '../../../src/shared';
import type { LogLine } from '../setup/log-sink';
import { deleteAll } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';

import {
  ACCOUNT_PASSWORD,
  cookieHeader,
  insertAccount,
  LOGIN_PATH,
  LOGOUT_PATH,
  REFRESH_PATH,
  setCookie,
} from './accounts';
import type { Account, AccountOptions } from './accounts';
import {
  createIdentityTestApp,
  validRegistration,
  verificationTokenSentTo,
} from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const WRONG_PASSWORD = 'Otra-Clave-Incorrecta-1';
const NEW_PASSWORD = 'Nimbo-Nueva-Clave-2026';
const SESSIONS_PATH = '/api/v1/sessions';
const CHANGE_PASSWORD_PATH = '/api/v1/auth/change-password';
/** Sesiones de la cuenta de «Seguridad»: la actual, la que se cierra a mano y dos que cierra el cambio. */
const SECURITY_LOGINS = 4;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7339.80 Safari/537.36';
const SHARED_IP = '203.0.113.77';
const PAST_GRACE_MS = (REFRESH_ROTATION_GRACE_SECONDS + 1) * 1000;
const PAST_IDLE_MS = SESSION_IDLE_TIMEOUT_DAYS * 86_400_000 + 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POLL_STEP_MS = 100;
const WAIT_MS = 30_000;

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');
const sessionIdOf = (refreshToken: string): string => refreshToken.split('.')[0] ?? '';

/** Ids que los flujos dejan para comparar con las líneas. */
const FLOW_ID_KEYS = [
  'verifiedUserId',
  'verifiedSessionId',
  'main',
  'mainFirstSessionId',
  'mainSecondSessionId',
  'mainDeviceId',
  'unverified',
  'suspended',
  'locked',
  'suspendedLater',
  'suspendedLaterSessionId',
  'expiringSessionId',
  'security',
  'securityClosedSessionId',
] as const;
type FlowIds = Record<(typeof FLOW_ID_KEYS)[number], string>;

/**
 * CA-25: bitácoras de PR-2 (plan 002 §7, R-8, RNF-17). Con `FixedClock` y `api` y `worker` en un solo `LogSink`
 * recorre la sesión al verificar, el inicio de sesión correcto (dispositivo nuevo y conocido) y cada fallo, el bloqueo,
 * el límite por IP, la renovación, cada rechazo, el reúso, el cierre, la cuenta suspendida y la sesión vencida. T-79
 * suma «Seguridad» (PR-4): cerrar una sesión, cerrar las demás y el cambio de contraseña con cada rechazo. Las
 * pruebas inspeccionan las líneas resultantes.
 */
describe('bitácoras del inicio de sesión y las sesiones (CA-25)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;
  const ids: FlowIds = Object.fromEntries(FLOW_ID_KEYS.map((key) => [key, ''])) as FlowIds;
  const secrets = new Set<string>([ACCOUNT_PASSWORD, WRONG_PASSWORD, NEW_PASSWORD, '$argon2']);
  const emails: string[] = [];
  const usedIps = new Set<string>([SHARED_IP]);
  let lines: LogLine[] = [];
  let nextIp = 0;

  const call = (path: string, cookies: Readonly<Record<string, string>> = {}) => {
    const ip = `198.51.100.${String((nextIp += 1) % 250)}`;
    usedIps.add(ip);
    const base = request(testApp.app.getHttpServer())
      .post(path)
      .set('User-Agent', USER_AGENT)
      .set('X-Forwarded-For', ip);
    return Object.keys(cookies).length === 0 ? base : base.set('Cookie', cookieHeader(cookies));
  };

  /** Guarda como secretos el valor de cada cookie de `identity` que trae la respuesta y el secreto de `nimbo_rt`. */
  const keepCookies = (response: Response): Response => {
    for (const name of ['nimbo_rt', 'nimbo_did']) {
      const value = setCookie(response.headers, name)?.value;
      if (value === undefined || value === '') continue;
      secrets.add(value);
      if (name === 'nimbo_rt') secrets.add(value.split('.')[1] ?? value);
    }
    return response;
  };

  const expectStatus = (response: Response, status: number): Response => {
    expect(response.status).toBe(status);
    return keepCookies(response);
  };

  const account = async (options?: AccountOptions): Promise<Account> => {
    const created = await insertAccount(dataSource, options);
    emails.push(created.email);
    return created;
  };

  const login = (email: string, password = ACCOUNT_PASSWORD, cookies = {}) =>
    call(LOGIN_PATH, cookies).send({ email, password });
  const refresh = (refreshToken: string) => call(REFRESH_PATH, { nimbo_rt: refreshToken });
  const refreshTokenOf = (response: Response): string =>
    setCookie(response.headers, 'nimbo_rt')?.value ?? '';

  /** Registro y apertura del enlace: `identity.verification.session_opened` (CA-15). */
  const runVerificationFlow = async (): Promise<void> => {
    const email = `bitacora-${randomUUID()}@nimbo.me`;
    emails.push(email);
    expectStatus(await call(REGISTER).send(validRegistration(email)), 202);
    const token = await verificationTokenSentTo(email);
    secrets.add(token);
    const verified = expectStatus(await call(VERIFY_EMAIL).send({ token }), 200);
    const body = verified.body as { session?: { user: { id: string } } };
    ids.verifiedUserId = body.session?.user.id ?? '';
    ids.verifiedSessionId = sessionIdOf(refreshTokenOf(verified));
  };

  /** Dispositivo nuevo y conocido, cada fallo con su categoría, renovación, gracia, reúso, revocado y cierre. */
  const runMainAccountFlows = async (): Promise<void> => {
    const main = await account();
    ids.main = main.id;
    const first = expectStatus(await login(main.email), 200);
    const device = setCookie(first.headers, 'nimbo_did')?.value ?? '';
    const second = expectStatus(
      await login(main.email, ACCOUNT_PASSWORD, { nimbo_did: device }),
      200,
    );
    ids.mainFirstSessionId = sessionIdOf(refreshTokenOf(first));
    ids.mainSecondSessionId = sessionIdOf(refreshTokenOf(second));
    expectStatus(await login(main.email, WRONG_PASSWORD), 401);
    expectStatus(await login(`nadie-${randomUUID()}@nimbo.me`, WRONG_PASSWORD), 401);
    const rotated = expectStatus(await refresh(refreshTokenOf(first)), 200);
    expectStatus(await refresh(refreshTokenOf(first)), 401);
    clock.advance(PAST_GRACE_MS);
    expectStatus(await refresh(refreshTokenOf(first)), 401);
    expectStatus(await refresh(refreshTokenOf(rotated)), 401);
    expectStatus(await call(LOGOUT_PATH, { nimbo_rt: refreshTokenOf(second) }), 204);
  };

  /** Mal formado y desconocido: rechazos sin sesión. */
  const runAnonymousRefreshFlows = async (): Promise<void> => {
    expectStatus(await refresh('no-es-un-token'), 401);
    const unknown = `${randomUUID()}.${randomBytes(32).toString('base64url')}`;
    secrets.add(unknown);
    expectStatus(await refresh(unknown), 401);
  };

  /** Cuenta no verificada, suspendida, bloqueo por correo y límite por IP. */
  const runRejectedLoginFlows = async (): Promise<void> => {
    const unverified = await account({ verified: false });
    const suspended = await account({ status: 'suspendida' });
    const locked = await account();
    Object.assign(ids, { unverified: unverified.id, suspended: suspended.id, locked: locked.id });
    expectStatus(await login(unverified.email), 403);
    expectStatus(await login(suspended.email), 403);
    for (let attempt = 0; attempt < LOGIN_MAX_FAILURES; attempt += 1) {
      expectStatus(await login(locked.email, WRONG_PASSWORD), 401);
    }
    expectStatus(await login(locked.email), 429);
    for (let attempt = 0; attempt <= LOGIN_ATTEMPTS_PER_IP; attempt += 1) {
      const response = await request(testApp.app.getHttpServer())
        .post(LOGIN_PATH)
        .set('User-Agent', USER_AGENT)
        .set('X-Forwarded-For', SHARED_IP)
        .send({ email: `ip-${randomUUID()}@nimbo.me`, password: WRONG_PASSWORD });
      expectStatus(response, attempt < LOGIN_ATTEMPTS_PER_IP ? 401 : 429);
    }
  };

  /** Token de acceso de la respuesta; se guarda como secreto. */
  const accessTokenOf = (response: Response): string => {
    const token = (response.body as { accessToken?: string }).accessToken ?? '';
    secrets.add(token);
    return token;
  };

  const withBearer = (test: request.Test, accessToken: string): request.Test =>
    test.set('User-Agent', USER_AGENT).set('Authorization', `Bearer ${accessToken}`);

  const changePassword = (accessToken: string, currentPassword: string, newPassword: string) =>
    withBearer(request(testApp.app.getHttpServer()).post(CHANGE_PASSWORD_PATH), accessToken).send({
      currentPassword,
      newPassword,
    });

  /** «Seguridad» (PR-4): cerrar una sesión de la lista, cambiar la contraseña y cerrar las demás. */
  const runSecuritySessionFlows = async (): Promise<string> => {
    const owner = await account();
    ids.security = owner.id;
    const logins: Response[] = [];
    for (let index = 0; index < SECURITY_LOGINS; index += 1) {
      logins.push(expectStatus(await login(owner.email), 200));
    }
    const [current, closed] = logins as [Response, Response];
    const accessToken = accessTokenOf(current);
    ids.securityClosedSessionId = sessionIdOf(refreshTokenOf(closed));
    const server = request(testApp.app.getHttpServer());
    const closePath = `${SESSIONS_PATH}/${ids.securityClosedSessionId}`;
    expectStatus(await withBearer(server.delete(closePath), accessToken), 204);
    expectStatus(await changePassword(accessToken, ACCOUNT_PASSWORD, ''), 422);
    expectStatus(await changePassword(accessToken, ACCOUNT_PASSWORD, NEW_PASSWORD), 204);
    const again = accessTokenOf(expectStatus(await login(owner.email, NEW_PASSWORD), 200));
    const others = withBearer(server.post(`${SESSIONS_PATH}/revoke-others`), again);
    expectStatus(await others, 200);
    return again;
  };

  /** Cinco contraseñas actuales incorrectas activan el bloqueo; el sexto intento, aun correcto, lo encuentra. */
  const runPasswordChangeLockFlow = async (accessToken: string): Promise<void> => {
    for (let attempt = 0; attempt < PASSWORD_CHANGE_MAX_FAILURES; attempt += 1) {
      expectStatus(await changePassword(accessToken, WRONG_PASSWORD, `${NEW_PASSWORD}-x`), 422);
    }
    expectStatus(await changePassword(accessToken, NEW_PASSWORD, `${NEW_PASSWORD}-x`), 429);
  };

  /** Cuenta suspendida tras iniciar sesión y, al final, sesión vencida por inactividad. */
  const runSuspendedAndExpiredFlows = async (): Promise<void> => {
    const later = await account();
    const laterLogin = expectStatus(await login(later.email), 200);
    await dataSource.query("UPDATE usuario SET estado = 'suspendida' WHERE id = $1", [later.id]);
    Object.assign(ids, {
      suspendedLater: later.id,
      suspendedLaterSessionId: sessionIdOf(refreshTokenOf(laterLogin)),
    });
    expectStatus(await refresh(refreshTokenOf(laterLogin)), 401);
    const expiring = await account();
    const expiringLogin = expectStatus(await login(expiring.email), 200);
    ids.expiringSessionId = sessionIdOf(refreshTokenOf(expiringLogin));
    clock.advance(PAST_IDLE_MS);
    expectStatus(await refresh(refreshTokenOf(expiringLogin)), 401);
  };

  /** Hashes que quedaron en la BD (contraseñas, huellas, refresco, tokens) y la parte local de cada correo. */
  const collectStoredSecrets = async (): Promise<void> => {
    const rows = (await dataSource.query(
      `SELECT u.id, u.hash_clave FROM usuario u WHERE u.correo = ANY($1)`,
      [emails],
    )) as { id: string; hash_clave: string }[];
    const userIds = rows.map((row) => row.id);
    for (const row of rows) secrets.add(row.hash_clave);
    const hashes = (await dataSource.query(
      `SELECT huella_hash AS h FROM dispositivo WHERE usuario_id = ANY($1)
       UNION ALL SELECT refresh_hash FROM sesion WHERE usuario_id = ANY($1)
       UNION ALL SELECT refresh_anterior_hash FROM sesion WHERE usuario_id = ANY($1) AND refresh_anterior_hash IS NOT NULL
       UNION ALL SELECT token_hash FROM token_cuenta WHERE usuario_id = ANY($1)`,
      [userIds],
    )) as { h: string }[];
    for (const { h } of hashes) secrets.add(h);
    for (const email of emails) {
      secrets.add(email);
      secrets.add(email.split('@')[0] ?? email);
    }
    const [device] = (await dataSource.query('SELECT id FROM dispositivo WHERE usuario_id = $1', [
      ids.main,
    ])) as { id: string }[];
    ids.mainDeviceId = device?.id ?? '';
  };

  const waitForWorker = async (): Promise<void> => {
    const deadline = Date.now() + WAIT_MS;
    for (;;) {
      const current = testApp.logs.lines();
      const enqueued = current.filter((line) => line.event === 'mail.enqueued').length;
      const sent = current.filter((line) => line.event === 'mail.sent').length;
      if (enqueued > 0 && sent === enqueued) return;
      if (Date.now() >= deadline)
        throw new Error('El worker no entregó todos los correos a tiempo.');
      await new Promise((resolve) => setTimeout(resolve, POLL_STEP_MS));
    }
  };

  const eventLines = (event: string): LogLine[] => lines.filter((line) => line.event === event);

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
    await deleteAll();
    testApp.logs.clear();

    await runVerificationFlow();
    await runMainAccountFlows();
    await runAnonymousRefreshFlows();
    await runRejectedLoginFlows();
    await runPasswordChangeLockFlow(await runSecuritySessionFlows());
    await runSuspendedAndExpiredFlows();
    await waitForWorker();
    await collectStoredSecrets();
    for (const value of [...secrets]) {
      if (/^[A-Za-z0-9_-]{43}$/.test(value)) secrets.add(sha256Hex(value));
    }
    lines = testApp.logs.lines();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-25: inicio de sesión correcto con `userId`, `sessionId` y `newDevice`, y `identity.device.new` con el uuid de la fila', () => {
    expect(eventLines('identity.login.succeeded')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: ids.main,
          sessionId: ids.mainFirstSessionId,
          newDevice: true,
        }),
        expect.objectContaining({
          userId: ids.main,
          sessionId: ids.mainSecondSessionId,
          newDevice: false,
        }),
      ]),
    );
    expect(eventLines('identity.device.new')).toContainEqual(
      expect.objectContaining({ userId: ids.main, deviceId: ids.mainDeviceId }),
    );
  });

  it('CA-25: cada fallo del inicio de sesión con su categoría; `userId` solo si la cuenta existe', () => {
    const failed = eventLines('identity.login.failed');

    expect(failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'invalid_credentials', userId: ids.main }),
        expect.objectContaining({ reason: 'email_not_verified', userId: ids.unverified }),
        expect.objectContaining({ reason: 'account_suspended', userId: ids.suspended }),
      ]),
    );
    const anonymous = failed.filter((line) => line.userId === undefined);
    expect(anonymous.length).toBeGreaterThan(0);
    expect(anonymous.every((line) => line.reason === 'invalid_credentials')).toBe(true);
  });

  it('CA-25: el bloqueo registra `identity.lockout.engaged` con `scope: login` e `identity.login.locked` con `retryAfterSeconds`', () => {
    const loginLockouts = eventLines('identity.lockout.engaged').filter(
      (line) => line.scope === 'login',
    );
    expect(loginLockouts).toEqual([expect.objectContaining({ userId: ids.locked, level: 40 })]);
    expect(eventLines('identity.login.locked')).toEqual([
      expect.objectContaining({ retryAfterSeconds: expect.any(Number), level: 40 }),
    ]);
  });

  it('CA-25: el límite por IP registra `identity.rate_limited` con `scope: ip_login`', () => {
    expect(eventLines('identity.rate_limited')).toEqual([
      expect.objectContaining({ scope: 'ip_login', retryAfterSeconds: expect.any(Number) }),
    ]);
  });

  it('CA-25: la renovación y cada rechazo con su motivo', () => {
    expect(eventLines('identity.session.refreshed')).toEqual([
      expect.objectContaining({ userId: ids.main, sessionId: ids.mainFirstSessionId }),
    ]);
    const rejected = eventLines('identity.session.refresh_rejected');
    expect(rejected.map((line) => line.reason).sort()).toEqual(
      ['expired', 'grace', 'malformed', 'revoked', 'suspended', 'unknown'].sort(),
    );
    expect(rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'grace', sessionId: ids.mainFirstSessionId }),
        expect.objectContaining({ reason: 'revoked', sessionId: ids.mainFirstSessionId }),
        expect.objectContaining({ reason: 'suspended', sessionId: ids.suspendedLaterSessionId }),
        expect.objectContaining({ reason: 'expired', sessionId: ids.expiringSessionId }),
      ]),
    );
  });

  it('CA-25: el reúso registra `identity.session.reuse_detected` con `userId` y `sessionId`', () => {
    expect(eventLines('identity.session.reuse_detected')).toEqual([
      expect.objectContaining({ userId: ids.main, sessionId: ids.mainFirstSessionId, level: 40 }),
    ]);
  });

  it('CA-25: el cierre registra `identity.session.revoked` con `reason: logout`, `count: 1` y la sesión', () => {
    expect(eventLines('identity.session.revoked')).toContainEqual(
      expect.objectContaining({
        userId: ids.main,
        sessionId: ids.mainSecondSessionId,
        reason: 'logout',
        count: 1,
      }),
    );
  });

  it('CA-25: las revocaciones por reúso y por cuenta suspendida registran `identity.session.revoked` con su motivo (plan §7)', () => {
    expect(eventLines('identity.session.revoked')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: ids.main,
          sessionId: ids.mainFirstSessionId,
          reason: 'reuse',
        }),
        expect.objectContaining({
          userId: ids.suspendedLater,
          sessionId: ids.suspendedLaterSessionId,
          reason: 'suspended',
        }),
      ]),
    );
  });

  it('CA-25: «Seguridad» registra `identity.session.revoked` con `user`, `password_change` y `others`', () => {
    expect(eventLines('identity.session.revoked')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: ids.security,
          sessionId: ids.securityClosedSessionId,
          reason: 'user',
          count: 1,
        }),
        expect.objectContaining({ userId: ids.security, reason: 'password_change', count: 2 }),
        expect.objectContaining({ userId: ids.security, reason: 'others', count: 1 }),
      ]),
    );
  });

  it('CA-25: el cambio registra `identity.password.changed` con `revokedCount`', () => {
    expect(eventLines('identity.password.changed')).toEqual([
      expect.objectContaining({ userId: ids.security, revokedCount: 2 }),
    ]);
  });

  it('CA-25: cada rechazo del cambio con su motivo y el bloqueo con `scope: password_change`', () => {
    const reasons = eventLines('identity.password_change.rejected')
      .filter((line) => line.userId === ids.security)
      .map((line) => line.reason);

    expect(reasons).toEqual([
      'weak',
      ...Array<string>(PASSWORD_CHANGE_MAX_FAILURES).fill('wrong_password'),
      'locked',
    ]);
    expect(eventLines('identity.lockout.engaged')).toContainEqual(
      expect.objectContaining({ scope: 'password_change', userId: ids.security, level: 40 }),
    );
  });

  it('CA-25: la sesión al verificar registra `identity.verification.session_opened` con `userId` y `sessionId`', () => {
    expect(ids.verifiedSessionId).toMatch(UUID);
    expect(eventLines('identity.verification.session_opened')).toEqual([
      expect.objectContaining({ userId: ids.verifiedUserId, sessionId: ids.verifiedSessionId }),
    ]);
  });

  it('CA-25: cada línea lleva `correlationId`, y `userId`, `sessionId` y `deviceId` son uuid', () => {
    expect(lines.length).toBeGreaterThan(0);
    const withoutCorrelation = lines.filter(
      (line) => typeof line.correlationId !== 'string' || line.correlationId === '',
    );
    expect(withoutCorrelation.map((line) => line.event ?? line.msg)).toEqual([]);
    for (const line of lines) {
      for (const field of ['userId', 'sessionId', 'deviceId']) {
        if (line[field] !== undefined) expect(line[field]).toMatch(UUID);
      }
    }
  });

  it('CA-25: ninguna línea trae correo, contraseña, token, valor de cookie, `huella_hash` ni hashes de credenciales', () => {
    expect(secrets.size).toBeGreaterThan(20);
    for (const line of lines) {
      const serialized = JSON.stringify(line);
      for (const secret of secrets) {
        expect(serialized).not.toContain(secret);
      }
    }
  });

  it('CA-25: ninguna línea `identity.*` ni `mail.*` trae IP ni el agente de usuario completo', () => {
    const domainLines = lines.filter((line) => /^(identity|mail)\./.test(String(line.event)));

    expect(domainLines.length).toBeGreaterThan(0);
    for (const line of domainLines) {
      expect(line).not.toHaveProperty('req');
      const serialized = JSON.stringify(line);
      expect(serialized).not.toContain(USER_AGENT);
      for (const ip of usedIps) {
        expect(serialized).not.toContain(ip);
      }
    }
  });
});
