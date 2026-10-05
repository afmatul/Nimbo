import { createHash, randomUUID } from 'node:crypto';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { deleteAll } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';
import { waitForLog } from '../setup/wait-for-log';

import {
  ACCOUNT_PASSWORD,
  cookieHeader,
  FORGOT_PASSWORD_PATH,
  insertAccount,
  LOGIN_PATH,
  REFRESH_PATH,
  RESET_PASSWORD_CHECK_PATH,
  RESET_PASSWORD_PATH,
  setCookie,
} from './accounts';
import {
  createIdentityTestApp,
  resetTokenSentTo,
  validRegistration,
  verificationTokenSentTo,
} from './identity-test-app';

/** Contraseña nueva válida (política de 001) y distinta de la de las cuentas de prueba. */
const NEW_PASSWORD = 'Recupero-Secreto-2026';
const ARGON2ID_PREFIX = '$argon2id$';
const RESET_TAG = 'identity.password-reset';
const REGISTER = '/api/v1/auth/register';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const CHANGED_TAG = 'identity.password-changed';

/** Tablas de `identity` donde podría quedar una credencial (E-R de 002). */
const IDENTITY_TABLES = ['usuario', 'token_cuenta', 'sesion', 'dispositivo'] as const;
type IdentityTable = (typeof IDENTITY_TABLES)[number];

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Secreto de un `nimbo_rt` (`<sid>.<secreto>`): el `sid` es el `id` público de la fila, no una credencial. */
const refreshSecretOf = (refreshToken: string): string => refreshToken.split('.')[1] ?? '';

/** Cookies de una sesión de `identity` abierta por la prueba. */
interface SessionCookies {
  readonly userId: string;
  readonly email: string;
  /** `nimbo_rt` de la verificación, del inicio de sesión y de su rotación, en ese orden. */
  readonly verified: string;
  readonly loggedIn: string;
  readonly rotated: string;
  readonly device: string;
}

/**
 * CA-24: nada recuperable en la base de datos ni en las bitácoras (RNF-04, R-3, R-8). El token de recuperación sale
 * del correo en Mailpit y la contraseña nueva es la que envía la prueba; ambos se buscan en todas las columnas de
 * `usuario`, `token_cuenta`, `sesion` y `dispositivo` y en el `LogSink`, que captura `api` y `worker` a la vez.
 * T-51 suma `nimbo_rt` (antes y después de rotar) y `nimbo_did` (CA-17), con una cuenta creada por la API para
 * que `hash_clave` sea el del registro real.
 */
describe('secreto de las credenciales: recuperación, sesión y dispositivo (CA-17, CA-24)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();

  /** Filas de `table` que contienen `value` en cualquiera de sus columnas. `table` es una constante de la prueba. */
  const rowsContaining = async (table: IdentityTable, value: string): Promise<number> => {
    const [row] = (await dataSource.query(
      `SELECT count(*)::int AS total FROM ${table} fila WHERE position($1 IN row_to_json(fila)::text) > 0`,
      [value],
    )) as { total: number }[];
    return row?.total ?? 0;
  };

  /** Cuántas filas de cada tabla de `identity` contienen `value`. */
  const occurrencesOf = async (value: string): Promise<Record<IdentityTable, number>> => {
    const entries = await Promise.all(
      IDENTITY_TABLES.map(async (table) => [table, await rowsContaining(table, value)] as const),
    );
    return Object.fromEntries(entries) as Record<IdentityTable, number>;
  };

  const noOccurrences: Record<IdentityTable, number> = {
    usuario: 0,
    token_cuenta: 0,
    sesion: 0,
    dispositivo: 0,
  };

  const resetHashesOf = async (userId: string): Promise<string[]> => {
    const rows = (await dataSource.query(
      `SELECT token_hash FROM token_cuenta WHERE usuario_id = $1 AND tipo = 'recuperacion'`,
      [userId],
    )) as { token_hash: string }[];
    return rows.map((row) => row.token_hash);
  };

  const passwordHashOf = async (userId: string): Promise<string> => {
    const [row] = (await dataSource.query('SELECT hash_clave FROM usuario WHERE id = $1', [
      userId,
    ])) as { hash_clave: string }[];
    if (row === undefined) throw new Error('La cuenta de la prueba no existe.');
    return row.hash_clave;
  };

  /** Espera a que el `worker` entregue el correo con `tag`, para que sus líneas también estén en el `LogSink`. */
  const mailDelivered = (tag: string) =>
    waitForLog(testApp.logs, (line) => line.event === 'mail.sent' && line.tag === tag);

  /** Cuenta verificada con una sesión abierta que pide la recuperación; devuelve el token del correo. */
  const requestedReset = async (): Promise<{ id: string; email: string; token: string }> => {
    const account = await insertAccount(dataSource);
    await request(server())
      .post(LOGIN_PATH)
      .send({ email: account.email, password: ACCOUNT_PASSWORD })
      .expect(200);
    await request(server()).post(FORGOT_PASSWORD_PATH).send({ email: account.email }).expect(202);
    const token = await resetTokenSentTo(account.email);
    await mailDelivered(RESET_TAG);
    return { id: account.id, email: account.email, token };
  };

  /** Filas de `sesion` de la cuenta con sus dos hashes, en orden de creación. */
  const sessionHashesOf = async (userId: string) =>
    (await dataSource.query(
      `SELECT id, refresh_hash, refresh_anterior_hash FROM sesion
        WHERE usuario_id = $1 ORDER BY creada_en, id`,
      [userId],
    )) as { id: string; refresh_hash: string; refresh_anterior_hash: string | null }[];

  /**
   * Registro y verificación por la API (sesión 1 y `nimbo_did`), inicio de sesión desde ese navegador (sesión 2) y una
   * renovación de la sesión 2.
   */
  const openedSessions = async (): Promise<SessionCookies> => {
    const email = `secreto-${randomUUID()}@nimbo.me`;
    await request(server()).post(REGISTER).send(validRegistration(email)).expect(202);
    const verification = await request(server())
      .post(VERIFY_EMAIL)
      .send({ token: await verificationTokenSentTo(email) })
      .expect(200);
    const device = setCookie(verification.headers, 'nimbo_did')?.value ?? '';
    const login = await request(server())
      .post(LOGIN_PATH)
      .set('Cookie', cookieHeader({ nimbo_did: device }))
      .send({ email, password: validRegistration(email).password })
      .expect(200);
    const loggedIn = setCookie(login.headers, 'nimbo_rt')?.value ?? '';
    const refreshed = await request(server())
      .post(REFRESH_PATH)
      .set('Cookie', cookieHeader({ nimbo_rt: loggedIn }))
      .expect(200);
    const [user] = (await dataSource.query('SELECT id FROM usuario WHERE correo = $1', [
      email,
    ])) as { id: string }[];
    return {
      userId: user?.id ?? '',
      email,
      verified: setCookie(verification.headers, 'nimbo_rt')?.value ?? '',
      loggedIn,
      rotated: setCookie(refreshed.headers, 'nimbo_rt')?.value ?? '',
      device,
    };
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp();
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await deleteAll();
    testApp.logs.clear();
  });

  it('CA-24: el token de recuperación del correo solo está como su SHA-256 en `token_cuenta`, antes y después de usarlo, y nunca en las bitácoras', async () => {
    const { id, token } = await requestedReset();

    const pending = await occurrencesOf(token);
    const pendingHashes = await resetHashesOf(id);
    await request(server()).post(RESET_PASSWORD_CHECK_PATH).send({ token }).expect(200);
    await request(server())
      .post(RESET_PASSWORD_PATH)
      .send({ token, password: NEW_PASSWORD })
      .expect(200);
    await mailDelivered(CHANGED_TAG);

    expect(pending).toEqual(noOccurrences);
    expect(pendingHashes).toEqual([sha256Hex(token)]);
    await expect(occurrencesOf(token)).resolves.toEqual(noOccurrences);
    await expect(resetHashesOf(id)).resolves.toEqual([sha256Hex(token)]);
    await expect(rowsContaining('token_cuenta', sha256Hex(token))).resolves.toBe(1);
    expect(JSON.stringify(testApp.logs.lines())).not.toContain(token);
  });

  it('CA-24: la contraseña nueva queda solo como `$argon2id$` en `usuario.hash_clave` y nunca en la base ni en las bitácoras', async () => {
    const { id, email, token } = await requestedReset();
    const before = await passwordHashOf(id);

    await request(server())
      .post(RESET_PASSWORD_PATH)
      .send({ token, password: NEW_PASSWORD })
      .expect(200);
    await mailDelivered(CHANGED_TAG);

    const after = await passwordHashOf(id);
    expect(after.startsWith(ARGON2ID_PREFIX)).toBe(true);
    expect(after).not.toBe(before);
    expect(after).not.toContain(NEW_PASSWORD);
    await expect(occurrencesOf(NEW_PASSWORD)).resolves.toEqual(noOccurrences);
    const logs = JSON.stringify(testApp.logs.lines());
    expect(logs).not.toContain(NEW_PASSWORD);
    expect(logs).not.toContain(ARGON2ID_PREFIX);
    await request(server()).post(LOGIN_PATH).send({ email, password: NEW_PASSWORD }).expect(200);
  });

  it('CA-24: una contraseña rechazada por débil (igual al correo) no queda en la base ni en las bitácoras', async () => {
    const { id, email, token } = await requestedReset();
    const weakPassword = email.toUpperCase();
    const before = await passwordHashOf(id);

    await request(server())
      .post(RESET_PASSWORD_PATH)
      .send({ token, password: weakPassword })
      .expect(422);

    await expect(passwordHashOf(id)).resolves.toBe(before);
    await expect(occurrencesOf(weakPassword)).resolves.toEqual(noOccurrences);
    expect(JSON.stringify(testApp.logs.lines())).not.toContain(weakPassword);
  });

  it('CA-24: cada `nimbo_rt`, antes y después de rotar, solo está como el SHA-256 de su secreto en `sesion` y nunca en las bitácoras', async () => {
    const cookies = await openedSessions();
    const refreshTokens = [cookies.verified, cookies.loggedIn, cookies.rotated];
    const secrets = refreshTokens.map(refreshSecretOf);

    expect(new Set(secrets).size).toBe(3);
    for (const value of [...refreshTokens, ...secrets]) {
      await expect(occurrencesOf(value)).resolves.toEqual(noOccurrences);
    }
    const hashes = secrets.map(sha256Hex);
    await expect(sessionHashesOf(cookies.userId)).resolves.toEqual(
      expect.arrayContaining([
        {
          id: cookies.verified.split('.')[0],
          refresh_hash: hashes[0],
          refresh_anterior_hash: null,
        },
        {
          id: cookies.loggedIn.split('.')[0],
          refresh_hash: hashes[2],
          refresh_anterior_hash: hashes[1],
        },
      ]),
    );
    const logs = JSON.stringify(testApp.logs.lines());
    for (const value of [...secrets, ...secrets.map(sha256Hex)]) {
      expect(logs).not.toContain(value);
    }
  });

  it('CA-17: `nimbo_did` es HttpOnly y su valor solo está como SHA-256 en `dispositivo.huella_hash`, nunca en las bitácoras', async () => {
    const email = `dispositivo-${randomUUID()}@nimbo.me`;
    await request(server()).post(REGISTER).send(validRegistration(email)).expect(202);

    const verification = await request(server())
      .post(VERIFY_EMAIL)
      .send({ token: await verificationTokenSentTo(email) })
      .expect(200);

    const cookie = setCookie(verification.headers, 'nimbo_did');
    expect(cookie?.attributes).toEqual(expect.arrayContaining(['httponly', 'samesite=strict']));
    const device = cookie?.value ?? '';
    expect(device).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(occurrencesOf(device)).resolves.toEqual(noOccurrences);
    await expect(rowsContaining('dispositivo', sha256Hex(device))).resolves.toBe(1);
    const logs = JSON.stringify(testApp.logs.lines());
    expect(logs).not.toContain(device);
    expect(logs).not.toContain(sha256Hex(device));
  });

  it('CA-24: la contraseña del registro queda como `$argon2id$` en `usuario.hash_clave` y en ningún otro lugar de la base', async () => {
    const cookies = await openedSessions();
    const password = validRegistration(cookies.email).password;

    const hash = await passwordHashOf(cookies.userId);

    expect(hash.startsWith(ARGON2ID_PREFIX)).toBe(true);
    await expect(occurrencesOf(password)).resolves.toEqual(noOccurrences);
    expect(JSON.stringify(testApp.logs.lines())).not.toContain(password);
  });
});
