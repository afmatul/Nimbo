import { randomUUID } from 'node:crypto';

import { ACCOUNT_SETUP_LINK_TTL_HOURS, errorResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { InternalAccountEnrollment } from '../../../src/modules/identity';
import { Argon2idHasher } from '../../../src/modules/identity/infrastructure/argon2id.hasher';
import { createActor, FixedClock, I_CLOCK, I_TRANSACTION_RUNNER, Role } from '../../../src/shared';
import type { ITransactionRunner } from '../../../src/shared';
import { uniqueEmployeeCode } from '../../support/employee-codes';
import type { TestApp } from '../setup/test-app';

import { ACCOUNT_PASSWORD, LOGIN_PATH } from './accounts';
import { createIdentityTestApp, setupTokenSentTo } from './identity-test-app';

const CHECK_PATH = '/api/v1/auth/account-setup/check';
const SETUP_PATH = '/api/v1/auth/account-setup';
const FIRST_PASSWORD = 'Primera-Clave-Segura-2026';
const MS_PER_HOUR = 3_600_000;

/**
 * Enlace de alta interna de punta a punta (011 CA-5, plan §4): alta por la fachada dentro de una transacción, correo
 * en Mailpit después del commit, revisión y uso del enlace por HTTP e inicio de sesión con la contraseña nueva. Cada
 * prueba da de alta una cuenta propia; el reloj es un `FixedClock` que mueve la prueba de vencimiento.
 */
describe('enlace de alta interna (011 CA-5)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;
  let nextIp = 0;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();
  const check = (token: string) => request(server()).post(CHECK_PATH).send({ token });
  const setUp = (token: string, password: string) =>
    request(server()).post(SETUP_PATH).send({ token, password });
  /** Una IP por intento, para no mezclarse con el límite por IP del inicio de sesión. */
  const login = (email: string, password: string) => {
    nextIp += 1;
    return request(server())
      .post(LOGIN_PATH)
      .set('X-Forwarded-For', `198.51.100.${String((nextIp % 250) + 1)}`)
      .send({ email, password });
  };

  /** Da de alta una cuenta de Soporte como lo hará el backoffice y envía el correo después del commit. */
  const enrolled = async (): Promise<{ id: string; email: string; token: string }> => {
    const email = `alta-${randomUUID()}@nimbo.me`;
    const transactions = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
    const enrollment = testApp.app.get(InternalAccountEnrollment);
    const { account, deliverInvitation } = await transactions.run(() =>
      enrollment.enroll(createActor(randomUUID(), Role.ADMIN), {
        fullName: 'Sofía Ramírez',
        email,
        employeeCode: uniqueEmployeeCode(),
        role: Role.SUPPORT,
      }),
    );
    await deliverInvitation();
    return { id: account.id, email, token: await setupTokenSentTo(email) };
  };

  const expectRejected = async (
    token: string,
    code: 'IDENTITY_SETUP_LINK_INVALID' | 'IDENTITY_SETUP_LINK_EXPIRED',
  ): Promise<void> => {
    for (const response of [await check(token), await setUp(token, FIRST_PASSWORD)]) {
      expect(response.status).toBe(422);
      expect(errorResponseSchema.parse(response.body).code).toBe(code);
    }
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    clock.set(new Date());
  });

  it('CA-5: alta → correo → revisar el enlace → crear la contraseña → iniciar sesión', async () => {
    const { email, token } = await enrolled();

    const checked = await check(token);
    const set = await setUp(token, FIRST_PASSWORD);

    expect(checked.status).toBe(200);
    expect(checked.body).toEqual({ status: 'valid' });
    expect(checked.headers['cache-control']).toBe('no-store');
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ status: 'password-set' });
    expect((await login(email, FIRST_PASSWORD)).status).toBe(200);
  });

  it('CA-5: el enlace queda guardado solo como hash y es de tipo `alta_interna`', async () => {
    const { id, token } = await enrolled();

    const rows = (await dataSource.query(
      'SELECT tipo, token_hash, expira_en, creado_en FROM token_cuenta WHERE usuario_id = $1',
      [id],
    )) as { tipo: string; token_hash: string; expira_en: Date; creado_en: Date }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tipo).toBe('alta_interna');
    expect(rows[0]?.token_hash).not.toContain(token);
    expect((rows[0]?.expira_en.getTime() ?? 0) - (rows[0]?.creado_en.getTime() ?? 0)).toBe(
      ACCOUNT_SETUP_LINK_TTL_HOURS * MS_PER_HOUR,
    );
  });

  it('CA-5: un enlace ya usado → `IDENTITY_SETUP_LINK_INVALID`', async () => {
    const { token } = await enrolled();
    await setUp(token, FIRST_PASSWORD).expect(200);

    await expectRejected(token, 'IDENTITY_SETUP_LINK_INVALID');
  });

  it('CA-5: un enlace inválido → `IDENTITY_SETUP_LINK_INVALID`', async () => {
    await expectRejected('no-es-un-token', 'IDENTITY_SETUP_LINK_INVALID');
  });

  it('CA-5: pasadas las 24 h → `IDENTITY_SETUP_LINK_EXPIRED` y el mensaje lleva a «¿Olvidaste tu contraseña?»', async () => {
    const { token } = await enrolled();
    clock.advance(ACCOUNT_SETUP_LINK_TTL_HOURS * MS_PER_HOUR);

    await expectRejected(token, 'IDENTITY_SETUP_LINK_EXPIRED');
    const body = errorResponseSchema.parse((await check(token)).body);
    expect(body.message).toContain('¿Olvidaste tu contraseña?');
  });

  it('CA-5: una contraseña débil → `IDENTITY_WEAK_PASSWORD` y el enlace sigue sirviendo', async () => {
    const { email, token } = await enrolled();

    const weak = await setUp(token, email);

    expect(weak.status).toBe(422);
    expect(errorResponseSchema.parse(weak.body).code).toBe('IDENTITY_WEAK_PASSWORD');
    await check(token).expect(200);
  });

  it('CA-5: fijar la primera contraseña no toca las sesiones abiertas de la cuenta', async () => {
    const { id, email, token } = await enrolled();
    // Una sesión previa, abierta con una contraseña conocida puesta por SQL: el enlace no debe cerrarla.
    const knownHash = await new Argon2idHasher().hash(ACCOUNT_PASSWORD);
    await dataSource.query('UPDATE usuario SET hash_clave = $1 WHERE id = $2', [
      knownHash.reveal(),
      id,
    ]);
    await login(email, ACCOUNT_PASSWORD).expect(200);

    await setUp(token, FIRST_PASSWORD).expect(200);

    const sessions = (await dataSource.query(
      'SELECT revocada_en FROM sesion WHERE usuario_id = $1',
      [id],
    )) as { revocada_en: Date | null }[];
    expect(sessions).toEqual([{ revocada_en: null }]);
  });
});
