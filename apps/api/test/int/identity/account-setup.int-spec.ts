import { randomUUID } from 'node:crypto';

import { ACCOUNT_SETUP_LINK_TTL_HOURS, errorResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AccountAdministration, InternalAccountEnrollment } from '../../../src/modules/identity';
import { OpaqueToken } from '../../../src/modules/identity/domain/opaque-token.vo';
import { Argon2idHasher } from '../../../src/modules/identity/infrastructure/argon2id.hasher';
import { createActor, FixedClock, I_CLOCK, I_TRANSACTION_RUNNER, Role } from '../../../src/shared';
import type { ITransactionRunner } from '../../../src/shared';
import { uniqueEmployeeCode } from '../../support/employee-codes';
import type { TestApp } from '../setup/test-app';

import {
  ACCOUNT_PASSWORD,
  LOGIN_PATH,
  RESET_PASSWORD_CHECK_PATH,
  RESET_PASSWORD_PATH,
} from './accounts';
import { createIdentityTestApp, setupTokenSentTo } from './identity-test-app';

const CHECK_PATH = '/api/v1/auth/account-setup/check';
const SETUP_PATH = '/api/v1/auth/account-setup';
const FIRST_PASSWORD = 'Primera-Clave-Segura-2026';
const MS_PER_HOUR = 3_600_000;
const FULL_NAME = 'Sofía Ramírez';

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
        fullName: FULL_NAME,
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

  const hashOf = async (id: string): Promise<string | undefined> => {
    const rows = (await dataSource.query('SELECT hash_clave FROM usuario WHERE id = $1', [id])) as {
      hash_clave: string;
    }[];
    return rows[0]?.hash_clave;
  };

  /** Guarda para `userId` un enlace vigente de otro tipo y devuelve su valor en claro. */
  const insertToken = async (
    userId: string,
    tipo: 'recuperacion' | 'verificacion',
  ): Promise<string> => {
    const value = OpaqueToken.generate();
    await dataSource.query(
      `INSERT INTO token_cuenta (usuario_id, tipo, token_hash, expira_en, creado_en)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, tipo, value.hash(), new Date(clock.now().getTime() + MS_PER_HOUR), clock.now()],
    );
    return value.toString();
  };

  /** Suspende y reactiva la cuenta por la fachada, como el backoffice, cada paso en su transacción. */
  const suspendAndReactivate = async (id: string): Promise<void> => {
    const transactions = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
    const administration = testApp.app.get(AccountAdministration);
    const admin = createActor(randomUUID(), Role.ADMIN);
    await transactions.run(() => administration.suspend(admin, id));
    await transactions.run(() => administration.reactivate(admin, id));
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

  it('plan §5: las dos rutas responden `Cache-Control: no-store`, también con un error (reciben el token del enlace)', async () => {
    const { token } = await enrolled();

    const responses = [
      await check(token),
      await setUp(token, FIRST_PASSWORD),
      await check('no-es-un-token'),
      await setUp('no-es-un-token', FIRST_PASSWORD),
    ];

    expect(responses.map((response) => response.status)).toEqual([200, 200, 422, 422]);
    expect(responses.map((response) => response.headers['cache-control'])).toEqual(
      Array(4).fill('no-store'),
    );
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

  it('RN-7: una interna suspendida no puede fijar la contraseña con su invitación', async () => {
    const { id, token } = await enrolled();
    await dataSource.query("UPDATE usuario SET estado = 'suspendida' WHERE id = $1", [id]);
    const before = await hashOf(id);

    await expectRejected(token, 'IDENTITY_SETUP_LINK_INVALID');
    expect(await hashOf(id)).toBe(before);
  });

  it('RN-7: suspender invalida la invitación; tras reactivar, el enlace sigue sin servir', async () => {
    const { id, token } = await enrolled();
    const before = await hashOf(id);

    await suspendAndReactivate(id);

    await expectRejected(token, 'IDENTITY_SETUP_LINK_INVALID');
    expect(await hashOf(id)).toBe(before);
  });

  it.each(['recuperacion', 'verificacion'] as const)(
    'CA-5: un enlace de `%s` no sirve como enlace de alta',
    async (tipo) => {
      const { id } = await enrolled();
      const before = await hashOf(id);

      await expectRejected(await insertToken(id, tipo), 'IDENTITY_SETUP_LINK_INVALID');
      expect(await hashOf(id)).toBe(before);
    },
  );

  it('CA-5: el enlace de alta no sirve para restablecer la contraseña y sigue vigente', async () => {
    const { token } = await enrolled();

    const responses = [
      await request(server()).post(RESET_PASSWORD_CHECK_PATH).send({ token }),
      await request(server()).post(RESET_PASSWORD_PATH).send({ token, password: FIRST_PASSWORD }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(422);
      expect(errorResponseSchema.parse(response.body).code).toBe('IDENTITY_RESET_LINK_INVALID');
    }
    await check(token).expect(200);
  });

  it('SEC-3: el alta deja `rejected` y `completed` con `userId` y correlación, sin token, correo, nombre ni contraseña', async () => {
    testApp.logs.clear();
    const { id, email, token } = await enrolled();
    // Pasa el esquema y solo el servicio la rechaza por ser igual al correo (como en 002).
    const weak = email.toUpperCase();

    await setUp(token, weak).expect(422);
    await setUp(token, FIRST_PASSWORD).expect(200);
    await check(token).expect(422);
    await check('no-es-un-token').expect(422);

    const lines = testApp.logs.lines();
    const setupLines = lines.filter((line) =>
      String(line.event).startsWith('identity.account_setup.'),
    );
    expect(setupLines).toEqual([
      expect.objectContaining({
        event: 'identity.account_setup.rejected',
        reason: 'weak',
        userId: id,
      }),
      expect.objectContaining({ event: 'identity.account_setup.completed', userId: id }),
      expect.objectContaining({
        event: 'identity.account_setup.rejected',
        reason: 'invalid',
        userId: id,
      }),
      expect.objectContaining({ event: 'identity.account_setup.rejected', reason: 'invalid' }),
    ]);
    expect(setupLines[3]).not.toHaveProperty('userId');
    for (const line of setupLines) {
      expect(typeof line.correlationId).toBe('string');
      expect(line.correlationId).not.toBe('');
    }
    for (const line of lines) {
      const serialized = JSON.stringify(line);
      for (const secret of [token, email, weak, FULL_NAME, FIRST_PASSWORD]) {
        expect(serialized).not.toContain(secret);
      }
    }
  });
});
