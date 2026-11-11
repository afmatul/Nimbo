import { randomUUID } from 'node:crypto';

import { LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILURES } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK, Role } from '../../src/shared';
import { Argon2idHasher } from '../../src/shared/infrastructure/security/argon2id.hasher';
import { createIdentityTestApp } from '../int/identity/identity-test-app';
import type { TestApp } from '../int/setup/test-app';
import { connectAsOwner } from '../support/database-urls';

import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld, WorldAccount } from './setup/isolation-world';

const LOGIN = '/api/v1/auth/login';
/** Contraseña real de las cuentas del mundo en esta suite (cumple la política de 001). */
const REAL_PASSWORD = 'Nimbo-Seguro-2026';
const WRONG_PASSWORD = 'Otra-Clave-Incorrecta-1';
const LOCK_SECONDS = LOGIN_LOCK_MINUTES * 60;

/** Lo que ve quien llama: status, cuerpo y cabeceras. */
interface Observed {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, unknown>>;
}

/**
 * Excepciones a «cabeceras idénticas», cada una justificada:
 * - `date`: hora de pared a la que se escribió la respuesta; depende de cuándo corre la prueba, no de la cuenta.
 * - `x-correlation-id`: la tarea la exceptúa. Aun así cada par manda el mismo `X-Correlation-Id`, así que el
 *   `correlationId` del cuerpo y las cabeceras derivadas del cuerpo (`content-length`, `etag`) deben coincidir.
 */
const observe = (response: Response): Observed => {
  const {
    date: _date,
    'x-correlation-id': _correlationId,
    ...headers
  } = response.headers as Record<string, unknown>;
  return { status: response.status, body: response.body as unknown, headers };
};

/**
 * Anti-enumeración del inicio de sesión (002 CA-2, CA-5, RN-2, Art. IX) sobre el mundo de aislamiento de 003: un
 * correo sin cuenta, un cliente y las tres cuentas internas con la contraseña incorrecta, y el bloqueo por correo con
 * y sin cuenta. Nadie que llame a `POST /auth/login` distingue, por status, cuerpo o cabeceras, si el correo tiene
 * cuenta ni de qué rol, y ninguna respuesta fallida abre sesión (`Set-Cookie`).
 */
describe('anti-enumeración del inicio de sesión (CA-2, CA-5)', () => {
  const clock = new FixedClock(new Date());
  let world: IsolationWorld;
  let owner: DataSource;
  let testApp: TestApp;
  let nextIp = 0;

  /** Una IP por clase: el límite por IP (CA-6) cuenta igual en todas y no se mezcla con el de correo. */
  const newIp = (): string => `203.0.113.${String((nextIp += 1))}`;

  const login = (email: string, password: string, correlationId: string, ip: string) =>
    request(testApp.app.getHttpServer())
      .post(LOGIN)
      .set('X-Forwarded-For', ip)
      .set('X-Correlation-Id', correlationId)
      .send({ email, password });

  const nobody = (): string => `ana.lopez.${randomUUID()}@ejemplo.com`;

  /** El intento llegó a la rama «la cuenta existe»: el fallo se registró con su `userId` (plan §7). */
  const failedWithAccount = (account: WorldAccount): boolean =>
    testApp.logs
      .lines()
      .some((line) => line.event === 'identity.login.failed' && line.userId === account.id);

  const expectNoSession = (observed: readonly Observed[]): void => {
    for (const response of observed) {
      expect(Object.keys(response.headers)).not.toContain('set-cookie');
    }
  };

  beforeAll(async () => {
    owner = await connectAsOwner();
    world = await createIsolationWorld();
    // El mundo trae un PHC de relleno; aquí cada cuenta tiene un Argon2id real, así «contraseña incorrecta» lo es.
    const phc = (await new Argon2idHasher().hash(REAL_PASSWORD)).reveal();
    const ids = [...world.clients, ...Object.values(world.internals)].map((account) => account.id);
    await owner.query('UPDATE usuario SET hash_clave = $1 WHERE id = ANY($2)', [phc, ids]);
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
  });

  afterAll(async () => {
    await testApp?.close();
    await owner?.destroy();
    await world?.close();
  });

  it('CA-2: correo inexistente, cliente e internas (admin, soporte, operador) con la contraseña incorrecta responden idéntico y sin cookies', async () => {
    const [client] = world.clients;
    const accounts: Record<string, WorldAccount> = {
      cliente: client,
      'interna-admin': world.internals[Role.ADMIN],
      'interna-soporte': world.internals[Role.SUPPORT],
      'interna-operador': world.internals[Role.OPERATOR],
    };

    const reference = observe(await login(nobody(), WRONG_PASSWORD, 'iso-login-ca2', newIp()));
    const observed: Record<string, Observed> = {};
    for (const [kind, account] of Object.entries(accounts)) {
      observed[kind] = observe(
        await login(account.email, WRONG_PASSWORD, 'iso-login-ca2', newIp()),
      );
    }

    expect(reference).toMatchObject({
      status: 401,
      body: { code: 'IDENTITY_INVALID_CREDENTIALS' },
    });
    for (const [kind, account] of Object.entries(accounts)) {
      expect({ kind, observed: observed[kind] }).toEqual({ kind, observed: reference });
      expect({ kind, foundAccount: failedWithAccount(account) }).toEqual({
        kind,
        foundAccount: true,
      });
    }
    expectNoSession([reference, ...Object.values(observed)]);
  });

  it('CA-5: el bloqueo por correo responde idéntico con y sin cuenta, paso a paso, aun con la contraseña correcta', async () => {
    const [, locked] = world.clients;
    const missing = nobody();
    const attempts = [
      ...Array.from({ length: LOGIN_MAX_FAILURES }, () => WRONG_PASSWORD),
      REAL_PASSWORD,
    ];
    const ips = { withAccount: newIp(), withoutAccount: newIp() };

    const withAccount: Observed[] = [];
    const withoutAccount: Observed[] = [];
    for (const [step, password] of attempts.entries()) {
      const correlationId = `iso-login-ca5-${String(step)}`;
      withAccount.push(
        observe(await login(locked.email, password, correlationId, ips.withAccount)),
      );
      withoutAccount.push(
        observe(await login(missing, password, correlationId, ips.withoutAccount)),
      );
    }

    expect(withAccount.map(({ status }) => status)).toEqual([
      ...Array.from({ length: LOGIN_MAX_FAILURES }, () => 401),
      429,
    ]);
    expect(withAccount.at(-1)).toMatchObject({
      body: { code: 'IDENTITY_LOGIN_LOCKED' },
      headers: { 'retry-after': String(LOCK_SECONDS) },
    });
    for (const [step, observed] of withoutAccount.entries()) {
      expect({ step, observed }).toEqual({ step, observed: withAccount[step] });
    }
    expect(failedWithAccount(locked)).toBe(true);
    expectNoSession([...withAccount, ...withoutAccount]);
  });
});
