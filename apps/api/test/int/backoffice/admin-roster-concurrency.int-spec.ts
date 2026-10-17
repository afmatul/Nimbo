import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { AuditModule, I_AUDIT_LOGGER } from '../../../src/modules/audit';
import type { IAuditLogger } from '../../../src/modules/audit';
import { InitialAdminBootstrapper } from '../../../src/modules/backoffice';
import { InternalAccountEnrollment } from '../../../src/modules/identity';
import { I_TRANSACTION_RUNNER } from '../../../src/shared';
import type { ITransactionRunner } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { uniqueEmployeeCode } from '../../support/employee-codes';
import { createIdentityTestApp } from '../identity/identity-test-app';
import type { TestApp } from '../setup/test-app';
import { removeAccounts } from '../storage/storage-test-db';

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
    // Seguro con Admin de otras suites: `jest.int.config.cjs` las corre en serie (`maxWorkers: 1`).
    const active = (await owner.query(
      "SELECT id FROM usuario WHERE rol = 'ADMIN' AND estado = 'activa'",
    )) as { id: string }[];
    othersSuspended = active.map((row) => row.id);
    await owner.query("UPDATE usuario SET estado = 'suspendida' WHERE id = ANY($1::uuid[])", [
      othersSuspended,
    ]);
  });

  afterAll(async () => {
    await testApp?.close();
    const ids = (await createdAdmins()).map((row) => row.id);
    await owner?.query('DELETE FROM evento_auditoria WHERE recurso_id = ANY($1::uuid[])', [ids]);
    await removeAccounts(owner, ids);
    await owner?.query("UPDATE usuario SET estado = 'activa' WHERE id = ANY($1::uuid[])", [
      othersSuspended,
    ]);
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
