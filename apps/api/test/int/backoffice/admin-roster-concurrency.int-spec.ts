import { randomUUID } from 'node:crypto';

import { errorResponseSchema, SHARED_ERROR_CODES } from '@nimbo/contracts';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { AuditModule, I_AUDIT_LOGGER } from '../../../src/modules/audit';
import type { IAuditLogger } from '../../../src/modules/audit';
import { InitialAdminBootstrapper } from '../../../src/modules/backoffice';
import { InternalAccountEnrollment } from '../../../src/modules/identity';
import { I_TRANSACTION_RUNNER, Role } from '../../../src/shared';
import type { ITransactionRunner } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { uniqueEmployeeCode } from '../../support/employee-codes';
import { createFullApiTestApp } from '../../support/full-api-test-app';
import { realAccessTokenIssuer } from '../../support/real-access-tokens';
import { createIdentityTestApp } from '../identity/identity-test-app';
import { buildTestEnv } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { insertAccount, removeAccounts } from '../storage/storage-test-db';

/** Suspende a los Administradores activos de otras suites y devuelve sus ids, para reactivarlos al final. */
const suspendActiveAdmins = async (owner: DataSource): Promise<string[]> => {
  // Seguro con Admin de otras suites: `jest.int.config.cjs` las corre en serie (`maxWorkers: 1`).
  const active = (await owner.query(
    "SELECT id FROM usuario WHERE rol = 'ADMIN' AND estado = 'activa'",
  )) as { id: string }[];
  const ids = active.map((row) => row.id);
  await owner.query("UPDATE usuario SET estado = 'suspendida' WHERE id = ANY($1::uuid[])", [ids]);
  return ids;
};

const reactivateAll = (owner: DataSource, ids: readonly string[]): Promise<unknown> =>
  owner.query("UPDATE usuario SET estado = 'activa' WHERE id = ANY($1::uuid[])", [ids]);

/**
 * Carreras sobre el padrón de Administradores (011 RN-7, CA-7; plan §7 R-2): el candado `pg_advisory_xact_lock` del
 * padrón serializa las transacciones que lo cambian. El alta inicial corre con las piezas reales (fachada de
 * `identity`, `AuditService` y Postgres como `nimbo_app`); la app de `identity` entrega el correo del alta.
 */
describe('padrón de Administradores bajo concurrencia (011 RN-7, CA-7)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let bootstrapper: InitialAdminBootstrapper;
  /** Administradores de otras suites: CA-7 exige un padrón sin activos; se reactivan al final. */
  let othersSuspended: string[] = [];
  const emails = [`carrera-a-${randomUUID()}@nimbo.me`, `carrera-b-${randomUUID()}@nimbo.me`];

  const createdAdmins = async (): Promise<{ id: string; estado: string }[]> =>
    (await owner.query('SELECT id, estado FROM usuario WHERE correo = ANY($1)', [emails])) as {
      id: string;
      estado: string;
    }[];

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ modules: [AuditModule] });
    owner = await connectAsOwner();
    bootstrapper = new InitialAdminBootstrapper(
      testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER),
      testApp.app.get(InternalAccountEnrollment),
      testApp.app.get<IAuditLogger>(I_AUDIT_LOGGER),
    );
    othersSuspended = await suspendActiveAdmins(owner);
  });

  afterAll(async () => {
    await testApp?.close();
    const ids = (await createdAdmins()).map((row) => row.id);
    await owner?.query('DELETE FROM evento_auditoria WHERE recurso_id = ANY($1::uuid[])', [ids]);
    await removeAccounts(owner, ids);
    await reactivateAll(owner, othersSuspended);
    await owner?.destroy();
  });

  it('CA-7: dos altas iniciales a la vez → un solo Administrador; la otra se niega sin crear nada', async () => {
    const results = await Promise.allSettled(
      emails.map((email) =>
        bootstrapper.bootstrap({
          fullName: 'Adriana Morales',
          email,
          employeeCode: uniqueEmployeeCode(),
        }),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'IDENTITY_ADMIN_ALREADY_EXISTS' });
    const admins = await createdAdmins();
    expect(admins).toEqual([{ id: expect.any(String) as string, estado: 'activa' }]);
    const events = (await owner.query(
      "SELECT recurso_id FROM evento_auditoria WHERE accion = 'account.bootstrap_admin' AND recurso_id = $1",
      [admins[0]?.id],
    )) as unknown[];
    expect(events).toHaveLength(1);
  });
});

/**
 * RN-7 por HTTP contra la API completa (`AppModule`) con tokens reales: los dos únicos Administradores activos se
 * suspenden uno al otro a la vez. El candado del padrón va **antes** de comprobar al actor (plan §7 R-2), así que quien
 * espera el candado ya se ve suspendido: una suspensión gana y la otra recibe `403`, y nunca quedan cero activos.
 */
describe('suspensiones cruzadas entre los dos únicos Administradores (011 RN-7)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let othersSuspended: string[] = [];
  const admins: string[] = [];

  beforeAll(async () => {
    const env = buildTestEnv();
    testApp = await createFullApiTestApp(env);
    owner = await connectAsOwner();
    othersSuspended = await suspendActiveAdmins(owner);
    admins.push(await insertAccount(owner, Role.ADMIN), await insertAccount(owner, Role.ADMIN));
  });

  afterAll(async () => {
    await testApp?.close();
    await removeAccounts(owner, admins);
    await reactivateAll(owner, othersSuspended);
    await owner?.destroy();
  });

  it('RN-7: una suspensión gana, la otra recibe `403 SHARED_FORBIDDEN` y queda un Administrador activo', async () => {
    const issuer = realAccessTokenIssuer(testApp.env);
    const [first = '', second = ''] = admins;
    const suspendAs = async (actorId: string, targetId: string) => {
      const { token } = await issuer.issueAccessToken({
        userId: actorId,
        role: Role.ADMIN,
        sessionId: randomUUID(),
      });
      return request(testApp.app.getHttpServer())
        .post(`/api/v1/backoffice/accounts/${targetId}/suspension`)
        .set('Authorization', `Bearer ${token}`);
    };

    const responses = await Promise.all([suspendAs(first, second), suspendAs(second, first)]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 403]);
    const denied = responses.find((response) => response.status === 403);
    expect(errorResponseSchema.parse(denied?.body).code).toBe(SHARED_ERROR_CODES.FORBIDDEN);
    const states = (await owner.query(
      'SELECT estado FROM usuario WHERE id = ANY($1::uuid[]) ORDER BY estado',
      [admins],
    )) as { estado: string }[];
    expect(states.map((row) => row.estado)).toEqual(['activa', 'suspendida']);
  });
});
