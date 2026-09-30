import { createHash } from 'node:crypto';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { deleteAll } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';
import { waitForLog } from '../setup/wait-for-log';

import {
  ACCOUNT_PASSWORD,
  FORGOT_PASSWORD_PATH,
  insertAccount,
  LOGIN_PATH,
  RESET_PASSWORD_CHECK_PATH,
  RESET_PASSWORD_PATH,
} from './accounts';
import { createIdentityTestApp, resetTokenSentTo } from './identity-test-app';

/** Contraseña nueva válida (política de 001) y distinta de la de las cuentas de prueba. */
const NEW_PASSWORD = 'Recupero-Secreto-2026';
const ARGON2ID_PREFIX = '$argon2id$';
const RESET_TAG = 'identity.password-reset';
const CHANGED_TAG = 'identity.password-changed';

/** Tablas de `identity` donde podría quedar una credencial (E-R de 002). */
const IDENTITY_TABLES = ['usuario', 'token_cuenta', 'sesion', 'dispositivo'] as const;
type IdentityTable = (typeof IDENTITY_TABLES)[number];

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * CA-24: nada recuperable en la base de datos ni en las bitácoras (RNF-04, R-3, R-8). El token de recuperación sale
 * del correo en Mailpit y la contraseña nueva es la que envía la prueba; ambos se buscan en todas las columnas de
 * `usuario`, `token_cuenta`, `sesion` y `dispositivo` y en el `LogSink`, que captura `api` y `worker` a la vez.
 * La parte de `nimbo_rt` y `nimbo_did` es de T-51.
 */
describe('secreto de las credenciales de la recuperación (CA-24)', () => {
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
});
