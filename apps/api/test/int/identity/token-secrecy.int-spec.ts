import { createHash, randomUUID } from 'node:crypto';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { deleteAll } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';
import { waitForLog } from '../setup/wait-for-log';

import {
  createIdentityTestApp,
  validRegistration,
  verificationTokenSentTo,
} from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
/** 32 bytes aleatorios en base64url sin relleno (plan §6.2, RN-4). */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * CA-17: el token del enlace solo existe como hash (D-19). El valor en claro sale del correo en Mailpit y se busca en
 * cada fila completa (todas sus columnas, también las de texto) de `usuario` y `token_cuenta`, y en las bitácoras de
 * `api` y `worker`, que el arnés captura en el mismo `LogSink`.
 */
describe('secreto del token de verificación (CA-17)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;

  /** Filas de `table` que contienen `value` en cualquiera de sus columnas. `table` es una constante de la prueba. */
  const rowsContaining = async (
    table: 'usuario' | 'token_cuenta',
    value: string,
  ): Promise<number> => {
    const [row] = (await dataSource.query(
      `SELECT count(*)::int AS total FROM ${table} fila WHERE position($1 IN row_to_json(fila)::text) > 0`,
      [value],
    )) as { total: number }[];
    return row?.total ?? 0;
  };

  const tokenHashesOf = async (email: string): Promise<string[]> => {
    const rows = (await dataSource.query(
      `SELECT t.token_hash FROM token_cuenta t JOIN usuario u ON u.id = t.usuario_id WHERE u.correo = $1`,
      [email],
    )) as { token_hash: string }[];
    return rows.map((row) => row.token_hash);
  };

  const register = async (email: string): Promise<void> => {
    await request(testApp.app.getHttpServer())
      .post(REGISTER)
      .send(validRegistration(email))
      .expect(202);
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

  it('CA-17: el token del correo no aparece en `usuario`, `token_cuenta` ni en las bitácoras de `api` y `worker`', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    await register(email);
    const token = await verificationTokenSentTo(email);
    await waitForLog(
      testApp.logs,
      (line) => line.event === 'mail.sent' && line.tag === 'identity.verification',
    );

    await expect(rowsContaining('usuario', token)).resolves.toBe(0);
    await expect(rowsContaining('token_cuenta', token)).resolves.toBe(0);
    expect(JSON.stringify(testApp.logs.lines())).not.toContain(token);
  });

  it('CA-17: `token_cuenta.token_hash` es el SHA-256 del token y no el token', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    await register(email);
    const token = await verificationTokenSentTo(email);

    const hashes = await tokenHashesOf(email);

    expect(hashes).toEqual([sha256Hex(token)]);
    expect(hashes[0]).not.toBe(token);
  });

  it('CA-17: dos registros generan tokens distintos de 256 bits', async () => {
    const firstEmail = `ana-${randomUUID()}@ejemplo.com`;
    const secondEmail = `luis-${randomUUID()}@ejemplo.com`;

    await register(firstEmail);
    const first = await verificationTokenSentTo(firstEmail);
    await deleteAll();
    await register(secondEmail);
    const second = await verificationTokenSentTo(secondEmail);

    expect(first).toMatch(TOKEN_FORMAT);
    expect(second).toMatch(TOKEN_FORMAT);
    expect(first).not.toBe(second);
    await expect(tokenHashesOf(firstEmail)).resolves.not.toEqual(await tokenHashesOf(secondEmail));
  });
});
