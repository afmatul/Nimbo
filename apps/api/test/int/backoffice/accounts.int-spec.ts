import { randomUUID } from 'node:crypto';

import {
  accountListItemSchema,
  accountListResponseSchema,
  errorResponseSchema,
  IDENTITY_ERROR_CODES,
  SHARED_ERROR_CODES,
} from '@nimbo/contracts';
import type { AccountListItem, AccountListResponse } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import type { JwtTokenService } from '../../../src/modules/identity/infrastructure/jwt/jwt-token.service';
import { NotificationsWorkerModule } from '../../../src/modules/notifications';
import { Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { uniqueEmployeeCode } from '../../support/employee-codes';
import { createFullApiTestApp } from '../../support/full-api-test-app';
import { realAccessTokenIssuer } from '../../support/real-access-tokens';
import { ACCOUNT_PASSWORD, insertAccount, LOGIN_PATH } from '../identity/accounts';
import type { Account, AccountOptions } from '../identity/accounts';
import { setupTokenSentTo } from '../identity/identity-test-app';
import { buildTestEnv } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { removeAccounts } from '../storage/storage-test-db';

const ACCOUNTS = '/api/v1/backoffice/accounts';
const SETUP_PATH = '/api/v1/auth/account-setup';
const FIRST_PASSWORD = 'Primera-Clave-Segura-2026';
/** Más de 2^31: el espacio usado viaja como texto decimal (ADR-0016). */
const USED_BYTES = 3_221_225_472n;
const OLDEST = new Date('2026-09-01T09:00:00.000Z');

type Http = ReturnType<typeof request>;

/**
 * Cuentas del backoffice por HTTP (011 CA-1 a CA-6, CA-14; plan §4, §5) contra la API completa (`AppModule`) con el
 * `worker` de correo en la misma app (el alta llega a Mailpit), Postgres como `nimbo_app` y tokens reales de
 * `identity`. Las cuentas se siembran como el dueño (*fixtures*) con contraseña conocida, para iniciar sesión.
 */
describe('`/backoffice/accounts` (011 CA-1 a CA-6)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let issuer: JwtTokenService;
  let admin: Account;
  let adminToken: string;
  let paidPlan: { id: string; name: string };
  const created: string[] = [];
  let nextIp = 0;

  const http = (): Http => request(testApp.app.getHttpServer());

  const newAccount = async (options: AccountOptions = {}): Promise<Account> => {
    const account = await insertAccount(owner, options);
    created.push(account.id);
    return account;
  };

  const tokenOf = async (userId: string, role: Role): Promise<string> =>
    (await issuer.issueAccessToken({ userId, role, sessionId: randomUUID() })).token;

  const asAdmin = (call: request.Test, correlationId: string = randomUUID()): request.Test =>
    call.set('Authorization', `Bearer ${adminToken}`).set('X-Correlation-Id', correlationId);

  /** Una IP por intento, para no mezclarse con el límite por IP del inicio de sesión. */
  const login = (email: string, password: string = ACCOUNT_PASSWORD): request.Test => {
    nextIp += 1;
    return http()
      .post(LOGIN_PATH)
      .set('X-Forwarded-For', `203.0.113.${String((nextIp % 250) + 1)}`)
      .send({ email, password });
  };

  const suspend = (id: string, correlationId?: string): request.Test =>
    asAdmin(http().post(`${ACCOUNTS}/${id}/suspension`), correlationId);
  const reactivate = (id: string): request.Test =>
    asAdmin(http().delete(`${ACCOUNTS}/${id}/suspension`));
  const getAccount = (id: string): request.Test => asAdmin(http().get(`${ACCOUNTS}/${id}`));
  const list = (query: Record<string, string>): request.Test =>
    asAdmin(http().get(ACCOUNTS).query(query));
  const enroll = (body: Record<string, string>, correlationId?: string): request.Test =>
    asAdmin(http().post(ACCOUNTS).send(body), correlationId);

  const itemOf = (response: Response, status = 200): AccountListItem => {
    expect(response.status).toBe(status);
    return accountListItemSchema.parse(response.body);
  };

  const pageOf = (response: Response): AccountListResponse => {
    expect(response.status).toBe(200);
    return accountListResponseSchema.parse(response.body);
  };

  const errorOf = (response: Response, status: number) => {
    expect(response.status).toBe(status);
    return errorResponseSchema.parse(response.body);
  };

  const eventsOn = async (targetId: string, action: string): Promise<{ attributes: unknown }[]> =>
    (await owner.query(
      `SELECT atributos AS attributes FROM evento_auditoria
        WHERE usuario_afectado_id = $1 AND recurso_id = $1 AND actor_id = $2 AND accion = $3`,
      [targetId, admin.id, action],
    )) as { attributes: unknown }[];

  const statusOf = async (id: string): Promise<string | undefined> => {
    const rows = (await owner.query('SELECT estado FROM usuario WHERE id = $1', [id])) as {
      estado: string;
    }[];
    return rows[0]?.estado;
  };

  const openSessions = async (userId: string): Promise<number> => {
    const rows = (await owner.query(
      'SELECT count(*)::int AS total FROM sesion WHERE usuario_id = $1 AND revocada_en IS NULL',
      [userId],
    )) as { total: number }[];
    return rows[0]?.total ?? 0;
  };

  const usersWith = async (email: string, employeeCode: string): Promise<number> => {
    const rows = (await owner.query(
      'SELECT count(*)::int AS total FROM usuario WHERE correo = $1 OR codigo_empleado = $2',
      [email, employeeCode.toUpperCase()],
    )) as { total: number }[];
    return rows[0]?.total ?? 0;
  };

  /** Tres cuentas con el mismo inicio de correo, de la más vieja a la más nueva. */
  const seedSearchable = async (prefix: string) => {
    const subscribed = await newAccount();
    const unsubscribed = await newAccount();
    const support = await newAccount({ role: 'SUPPORT' });
    const rows = [subscribed, unsubscribed, support];
    for (const [index, account] of rows.entries()) {
      await owner.query('UPDATE usuario SET correo = $1, creado_en = $2 WHERE id = $3', [
        `${prefix}-${String(index)}@nimbo.me`,
        new Date(OLDEST.getTime() + index * 60_000),
        account.id,
      ]);
    }
    await owner.query('UPDATE usuario SET espacio_usado = $1 WHERE id = $2', [
      USED_BYTES.toString(),
      subscribed.id,
    ]);
    await owner.query('INSERT INTO suscripcion (usuario_id, plan_id) VALUES ($1, $2)', [
      subscribed.id,
      paidPlan.id,
    ]);
    return { subscribed, unsubscribed, support };
  };

  beforeAll(async () => {
    const env = buildTestEnv({}, { withWorkerEnv: true });
    testApp = await createFullApiTestApp(env, [NotificationsWorkerModule]);
    issuer = realAccessTokenIssuer(env);
    owner = await connectAsOwner();
    admin = await newAccount({ role: 'ADMIN' });
    adminToken = await tokenOf(admin.id, Role.ADMIN);
    const plans = (await owner.query("SELECT id, nombre FROM plan WHERE slug = 'equipo'")) as {
      id: string;
      nombre: string;
    }[];
    paidPlan = { id: plans[0]?.id ?? '', name: plans[0]?.nombre ?? '' };
  });

  afterAll(async () => {
    await testApp?.close();
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  describe('lista y ficha (CA-1)', () => {
    const prefix = `lista-${randomUUID()}`;
    let seeded: Awaited<ReturnType<typeof seedSearchable>>;

    beforeAll(async () => {
      seeded = await seedSearchable(prefix);
    });

    it('CA-1: busca por el inicio del correo y lista de la más nueva a la más vieja, con plan y espacio de los clientes', async () => {
      const body = pageOf(await list({ email: `  ${prefix.toUpperCase()}` }));

      expect(body).toMatchObject({ page: 1, pageSize: 10, total: 3 });
      expect(body.items.map((item) => [item.id, item.planName, item.usedBytes])).toEqual([
        [seeded.support.id, null, null],
        [seeded.unsubscribed.id, null, '0'],
        [seeded.subscribed.id, paidPlan.name, USED_BYTES.toString()],
      ]);
      expect(body.items[2]).toEqual({
        id: seeded.subscribed.id,
        email: `${prefix}-0@nimbo.me`,
        fullName: seeded.subscribed.fullName,
        role: Role.CLIENT,
        status: 'active',
        emailVerified: true,
        planName: paidPlan.name,
        usedBytes: USED_BYTES.toString(),
        createdAt: OLDEST.toISOString(),
        isSelf: false,
      });
    });

    it('CA-1: la página 2 de una búsqueda con 3 cuentas viene vacía y conserva el total', async () => {
      const body = pageOf(await list({ email: prefix, page: '2' }));

      expect(body).toMatchObject({ items: [], page: 2, total: 3 });
    });

    it('plan §4: una página no válida responde `400 BACKOFFICE_INVALID_QUERY` con el campo', async () => {
      const body = errorOf(await list({ page: '0' }), 400);

      expect(body.code).toBe('BACKOFFICE_INVALID_QUERY');
      expect(body.fields?.map((issue) => `${issue.field}:${issue.reason}`)).toEqual([
        'page:INVALID_PAGE',
      ]);
    });

    it.each([
      ['un cliente con suscripción', 'subscribed', true],
      ['un cliente sin suscripción («—»)', 'unsubscribed', false],
      ['una interna («—»)', 'support', false],
    ] as const)('CA-1: la ficha de %s', async (_case, key, hasPlan) => {
      const item = itemOf(await getAccount(seeded[key].id));

      expect(item).toMatchObject({
        id: seeded[key].id,
        planName: hasPlan ? paidPlan.name : null,
        isSelf: false,
      });
    });

    it('CA-4: la ficha propia marca `isSelf` y, como interna, no trae plan ni espacio', async () => {
      const item = itemOf(await getAccount(admin.id));

      expect(item).toMatchObject({
        id: admin.id,
        role: Role.ADMIN,
        planName: null,
        usedBytes: null,
        isSelf: true,
      });
    });

    it.each([
      ['inexistente', randomUUID()],
      ['que no es un UUID', 'no-es-un-uuid'],
    ])('plan §4: una cuenta %s → `404 IDENTITY_ACCOUNT_NOT_FOUND`', async (_case, id) => {
      expect(errorOf(await getAccount(id), 404).code).toBe(IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND);
    });
  });

  describe('suspender y reactivar (CA-2 a CA-4)', () => {
    it('CA-2: suspender un cliente revoca sus sesiones, su login da `IDENTITY_ACCOUNT_SUSPENDED` y se audita', async () => {
      const client = await newAccount();
      await login(client.email).expect(200);

      const item = itemOf(await suspend(client.id));

      expect(item).toMatchObject({ id: client.id, status: 'suspended' });
      expect(await openSessions(client.id)).toBe(0);
      expect(errorOf(await login(client.email), 403).code).toBe(
        IDENTITY_ERROR_CODES.ACCOUNT_SUSPENDED,
      );
      expect(await eventsOn(client.id, 'account.suspended')).toHaveLength(1);
    });

    it('CA-2: también se suspende una cuenta interna ajena', async () => {
      const support = await newAccount({ role: 'SUPPORT' });

      expect(itemOf(await suspend(support.id))).toMatchObject({ status: 'suspended' });
      expect(await statusOf(support.id)).toBe('suspendida');
    });

    it('CA-3: reactivar devuelve el acceso, las sesiones revocadas no vuelven y se audita', async () => {
      const client = await newAccount();
      await login(client.email).expect(200);
      itemOf(await suspend(client.id));

      const item = itemOf(await reactivate(client.id));

      expect(item).toMatchObject({ id: client.id, status: 'active' });
      expect(await openSessions(client.id)).toBe(0);
      await login(client.email).expect(200);
      expect(await eventsOn(client.id, 'account.reactivated')).toHaveLength(1);
    });

    it.each([
      ['suspender una cuenta ya suspendida', 'suspendida', suspend],
      ['reactivar una cuenta activa', 'activa', reactivate],
    ] as const)(
      'plan §4: %s → `409 IDENTITY_ACCOUNT_STATE_CONFLICT` sin evento',
      async (_case, status, call) => {
        const client = await newAccount({ status });

        expect(errorOf(await call(client.id), 409).code).toBe(
          IDENTITY_ERROR_CODES.ACCOUNT_STATE_CONFLICT,
        );
        expect(await statusOf(client.id)).toBe(status);
        expect(await eventsOn(client.id, 'account.suspended')).toEqual([]);
        expect(await eventsOn(client.id, 'account.reactivated')).toEqual([]);
      },
    );

    it.each([
      ['suspenderse', suspend],
      ['reactivarse', reactivate],
    ] as const)(
      'CA-4: %s a sí mismo → `409 IDENTITY_CANNOT_CHANGE_OWN_STATUS` y nada cambia',
      async (_case, call) => {
        expect(errorOf(await call(admin.id), 409).code).toBe(
          IDENTITY_ERROR_CODES.CANNOT_CHANGE_OWN_STATUS,
        );
        expect(await statusOf(admin.id)).toBe('activa');
      },
    );

    it('plan §4: suspender una cuenta inexistente → `404 IDENTITY_ACCOUNT_NOT_FOUND`', async () => {
      expect(errorOf(await suspend(randomUUID()), 404).code).toBe(
        IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND,
      );
    });

    it('CA-14, RN-7: un Administrador suspendido con su token aún vigente recibe `403 SHARED_FORBIDDEN`', async () => {
      const suspended = await newAccount({ role: 'ADMIN', status: 'suspendida' });
      const token = await tokenOf(suspended.id, Role.ADMIN);
      const client = await newAccount();
      const correlationId = randomUUID();
      const asSuspended = (call: request.Test): request.Test =>
        call.set('Authorization', `Bearer ${token}`).set('X-Correlation-Id', correlationId);

      const responses = [
        await asSuspended(http().get(ACCOUNTS)),
        await asSuspended(http().post(`${ACCOUNTS}/${client.id}/suspension`)),
      ];

      for (const response of responses) {
        expect(errorOf(response, 403).code).toBe(SHARED_ERROR_CODES.FORBIDDEN);
      }
      expect(await statusOf(client.id)).toBe('activa');
      expect(
        testApp.logs
          .withCorrelationId(correlationId)
          .filter((line) => line.event === 'backoffice.actor.inactive'),
      ).toEqual([
        expect.objectContaining({ actorId: suspended.id, actorRole: Role.ADMIN }),
        expect.objectContaining({ actorId: suspended.id, actorRole: Role.ADMIN }),
      ]);
    });

    it('RNF-17: suspender deja `backoffice.account.suspended` e `identity.session.revoked` solo con ids', async () => {
      const client = await newAccount();
      await login(client.email).expect(200);
      const correlationId = randomUUID();

      itemOf(await suspend(client.id, correlationId));

      const lines = testApp.logs.withCorrelationId(correlationId);
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'backoffice.account.suspended',
            actorId: admin.id,
            accountId: client.id,
          }),
          expect.objectContaining({
            event: 'identity.session.revoked',
            userId: client.id,
            reason: 'account_suspended',
            count: 1,
          }),
        ]),
      );
      expect(JSON.stringify(lines)).not.toContain(client.email);
    });
  });

  describe('alta interna (CA-5, CA-6)', () => {
    const enrollment = (overrides: Record<string, string> = {}): Record<string, string> => ({
      fullName: 'Sofía Ramírez',
      email: `alta-${randomUUID()}@nimbo.me`,
      employeeCode: ` ${uniqueEmployeeCode().toLowerCase()} `,
      role: Role.SUPPORT,
      ...overrides,
    });

    const track = (item: AccountListItem): AccountListItem => {
      created.push(item.id);
      return item;
    };

    it('CA-5: alta → correo en Mailpit → crear la contraseña → iniciar sesión; se audita con el rol', async () => {
      const body = enrollment();

      const item = track(itemOf(await enroll(body), 201));

      expect(item).toMatchObject({
        email: body.email,
        fullName: body.fullName,
        role: Role.SUPPORT,
        status: 'active',
        emailVerified: true,
        planName: null,
        usedBytes: null,
        isSelf: false,
      });
      const events = await eventsOn(item.id, 'account.internal_created');
      expect(events).toEqual([{ attributes: { role: Role.SUPPORT } }]);
      const token = await setupTokenSentTo(body.email ?? '');
      await http().post(SETUP_PATH).send({ token, password: FIRST_PASSWORD }).expect(200);
      await login(body.email ?? '', FIRST_PASSWORD).expect(200);
    });

    it('RNF-17: el alta deja `backoffice.account.enrolled` con ids y rol, sin correo, nombre ni código', async () => {
      const body = enrollment();
      const correlationId = randomUUID();

      const item = track(itemOf(await enroll(body, correlationId), 201));

      const lines = testApp.logs.withCorrelationId(correlationId);
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'backoffice.account.enrolled',
            actorId: admin.id,
            accountId: item.id,
            role: Role.SUPPORT,
          }),
        ]),
      );
      const serialized = JSON.stringify(lines);
      for (const secret of [
        body.email ?? '',
        body.fullName ?? '',
        (body.employeeCode ?? '').trim(),
      ]) {
        expect(serialized).not.toContain(secret);
      }
      await setupTokenSentTo(body.email ?? '');
    });

    it.each([
      ['el correo', true, false, ['email:EMAIL_IN_USE']],
      ['el código de empleado', false, true, ['employeeCode:EMPLOYEE_CODE_IN_USE']],
      ['ambos', true, true, ['email:EMAIL_IN_USE', 'employeeCode:EMPLOYEE_CODE_IN_USE']],
    ])(
      'CA-6: repetir %s → `409 IDENTITY_ENROLLMENT_CONFLICT` con los campos y no se crea nada',
      async (_case, sameEmail, sameCode, reasons) => {
        const first = enrollment();
        track(itemOf(await enroll(first), 201));
        await setupTokenSentTo(first.email ?? '');
        const second = enrollment({
          ...(sameEmail ? { email: first.email ?? '' } : {}),
          ...(sameCode ? { employeeCode: first.employeeCode ?? '' } : {}),
        });

        const body = errorOf(await enroll(second), 409);

        expect(body.code).toBe(IDENTITY_ERROR_CODES.ENROLLMENT_CONFLICT);
        expect(body.fields?.map((issue) => `${issue.field}:${issue.reason}`)).toEqual(reasons);
        expect(await usersWith(second.email ?? '', (second.employeeCode ?? '').trim())).toBe(1);
      },
    );

    it('CA-6: el rol Cliente → `422 IDENTITY_INVALID_INPUT` con `role` y no se crea nada', async () => {
      const body = enrollment({ role: Role.CLIENT });

      const error = errorOf(await enroll(body), 422);

      expect(error.code).toBe(IDENTITY_ERROR_CODES.INVALID_INPUT);
      expect(error.fields?.map((issue) => `${issue.field}:${issue.reason}`)).toEqual([
        'role:INVALID_ROLE',
      ]);
      expect(await usersWith(body.email ?? '', (body.employeeCode ?? '').trim())).toBe(0);
    });
  });
});
