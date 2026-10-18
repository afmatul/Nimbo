import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';

import type { DataSource } from 'typeorm';

import { AuditAction, SYSTEM_ACTOR } from '../../../src/modules/audit';
import { AuditService } from '../../../src/modules/audit/application/audit.service';
import { TypeOrmAuditRepository } from '../../../src/modules/audit/infrastructure/persistence/typeorm-audit.repository';
import { Role, SystemClock } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { uniqueEmployeeCode } from '../../support/employee-codes';
import { createIdentityTestApp, setupTokenSentTo } from '../identity/identity-test-app';
import { compiledEntry } from '../setup/compiled-api';
import type { TestApp } from '../setup/test-app';
import { connectAsAppDatabase, insertAccount, removeAccounts } from '../storage/storage-test-db';
import type { AppDatabase } from '../storage/storage-test-db';

const API_ROOT = resolve(__dirname, '../../..');
/** El comando compilado con `tsc` por el arnés: con `tsx` la inyección por tipo de Nest falla (`compiled-api.ts`). */
const BOOTSTRAP_SCRIPT = resolve(dirname(compiledEntry('main')), 'scripts', 'bootstrap-admin.js');

interface ScriptRun {
  readonly exitCode: number | null;
  readonly output: string;
  /** Líneas JSON de la salida (stdout y stderr), en orden. */
  readonly events: readonly Record<string, unknown>[];
}

/** Corre `admin:bootstrap` como proceso real con el entorno del arnés (como `nimbo_app`). */
const runBootstrap = (args: readonly string[]): Promise<ScriptRun> =>
  new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [BOOTSTRAP_SCRIPT, ...args], {
      cwd: API_ROOT,
      env: process.env,
    });
    let output = '';
    const collect = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', reject);
    child.once('exit', (exitCode) => {
      const events = output
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      resolveRun({ exitCode, output, events });
    });
  });

const argsFor = (email: string, employeeCode: string): string[] => [
  '--name',
  'Adriana Morales',
  '--email',
  email,
  '--employee-code',
  employeeCode,
];

interface AccountRow {
  readonly id: string;
  readonly rol: string;
  readonly estado: string;
  readonly correo_verificado: boolean;
}

const eventNamed = (run: ScriptRun, event: string): Record<string, unknown> | undefined =>
  run.events.find((line) => line.event === event);

/**
 * Alta inicial por comando (011 CA-7, RN-3; plan §4, §6): el script compilado crea el primer Administrador con el
 * enlace de CA-5 y el evento de sistema en la misma transacción, o se niega si ya hay uno activo. Cada prueba empieza
 * con el padrón sin Administradores activos: se suspenden los que dejaron otras suites (y se reactivan al final) y los
 * de esta suite. La app de `identity` aporta el `worker` de `mail`, que entrega el enlace a Mailpit.
 */
describe('comando `admin:bootstrap` (011 CA-7)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let database: AppDatabase;
  /** Administradores de otras suites que esta suspende y devuelve a `activa` al final. */
  const othersSuspended = new Set<string>();
  const created: string[] = [];

  /** Seguro con Admin de otras suites: `jest.int.config.cjs` las corre en serie (`maxWorkers: 1`). */
  const suspendActiveAdmins = async (): Promise<void> => {
    const active = (await owner.query(
      "SELECT id FROM usuario WHERE rol = 'ADMIN' AND estado = 'activa'",
    )) as { id: string }[];
    const ids = active.map((row) => row.id);
    await owner.query("UPDATE usuario SET estado = 'suspendida' WHERE id = ANY($1::uuid[])", [ids]);
    ids.filter((id) => !created.includes(id)).forEach((id) => othersSuspended.add(id));
  };

  const accountWithEmail = async (email: string): Promise<AccountRow | undefined> => {
    const rows = (await owner.query(
      'SELECT id, rol, estado, correo_verificado FROM usuario WHERE correo = $1',
      [email],
    )) as AccountRow[];
    return rows[0];
  };

  const bootstrapEventsCount = async (): Promise<number> => {
    const rows = (await owner.query(
      "SELECT count(*)::int AS total FROM evento_auditoria WHERE accion = 'account.bootstrap_admin'",
    )) as { total: number }[];
    return rows[0]?.total ?? 0;
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp();
    owner = await connectAsOwner();
    database = await connectAsAppDatabase();
  });

  beforeEach(async () => {
    await suspendActiveAdmins();
  });

  afterAll(async () => {
    await testApp?.close();
    await database?.dataSource.destroy();
    await owner?.query('DELETE FROM evento_auditoria WHERE recurso_id = ANY($1::uuid[])', [
      created,
    ]);
    await removeAccounts(owner, created);
    await owner?.query("UPDATE usuario SET estado = 'activa' WHERE id = ANY($1::uuid[])", [
      [...othersSuspended],
    ]);
    await owner?.destroy();
  });

  it('CA-7: sin Administrador activo, crea uno verificado con el enlace de CA-5, sale con 0 y no imprime el token ni el correo', async () => {
    const email = `primer-admin-${randomUUID()}@nimbo.me`;

    const run = await runBootstrap(argsFor(email, uniqueEmployeeCode()));

    expect(run.exitCode).toBe(0);
    const account = await accountWithEmail(email);
    created.push(...(account === undefined ? [] : [account.id]));
    expect(account).toMatchObject({ rol: 'ADMIN', estado: 'activa', correo_verificado: true });
    expect(eventNamed(run, 'admin.bootstrap.completed')).toMatchObject({ userId: account?.id });
    const token = await setupTokenSentTo(email);
    expect(run.output).not.toContain(token);
    expect(run.output).not.toContain(email);
    expect(run.output).not.toContain('crear-contrasena');
  });

  it('CA-7: la cuenta, su enlace y el evento de sistema se confirman en la misma transacción, sin afectado', async () => {
    const email = `admin-atomico-${randomUUID()}@nimbo.me`;

    const run = await runBootstrap(argsFor(email, uniqueEmployeeCode()));

    expect(run.exitCode).toBe(0);
    const account = await accountWithEmail(email);
    created.push(...(account === undefined ? [] : [account.id]));
    const rows = (await owner.query(
      `SELECT (SELECT xmin::text FROM usuario WHERE id = $1) AS cuenta,
              (SELECT xmin::text FROM token_cuenta WHERE usuario_id = $1 AND tipo = 'alta_interna') AS enlace,
              e.xmin::text AS evento, e.rol_actor, e.actor_id, e.usuario_afectado_id, e.tipo_recurso
         FROM evento_auditoria e
        WHERE e.accion = 'account.bootstrap_admin' AND e.recurso_id = $1`,
      [account?.id],
    )) as Record<string, string | null>[];
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.cuenta).toBe(row?.evento);
    expect(row?.enlace).toBe(row?.evento);
    expect(row).toMatchObject({
      rol_actor: 'SYSTEM',
      actor_id: null,
      usuario_afectado_id: null,
      tipo_recurso: 'account',
    });
    await setupTokenSentTo(email);
  });

  it('CA-7: con un Administrador activo, se niega con `IDENTITY_ADMIN_ALREADY_EXISTS`, sale con 1 y no crea nada', async () => {
    created.push(await insertAccount(owner, Role.ADMIN));
    const email = `segundo-admin-${randomUUID()}@nimbo.me`;
    const eventsBefore = await bootstrapEventsCount();

    const run = await runBootstrap(argsFor(email, uniqueEmployeeCode()));

    expect(run.exitCode).toBe(1);
    expect(eventNamed(run, 'admin.bootstrap.refused')).toMatchObject({
      code: 'IDENTITY_ADMIN_ALREADY_EXISTS',
    });
    expect(await accountWithEmail(email)).toBeUndefined();
    expect(await bootstrapEventsCount()).toBe(eventsBefore);
    expect(run.output).not.toContain(email);
  });

  it('CA-7: con argumentos inválidos, se niega sin crear nada, nombra la opción y no repite su valor', async () => {
    const eventsBefore = await bootstrapEventsCount();

    const run = await runBootstrap(argsFor('no-es-un-correo', uniqueEmployeeCode()));

    expect(run.exitCode).toBe(1);
    expect(await bootstrapEventsCount()).toBe(eventsBefore);
    expect(eventNamed(run, 'admin.bootstrap.refused')).toMatchObject({
      reason: 'invalid_arguments',
      options: ['--email'],
    });
    expect(run.output).not.toContain('no-es-un-correo');
  });

  it('CA-7: con una opción desconocida, se niega con `unknown_option` sin repetir lo escrito', async () => {
    const run = await runBootstrap(['--correo', 'desconocida@nimbo.me']);

    expect(run.exitCode).toBe(1);
    expect(eventNamed(run, 'admin.bootstrap.refused')).toEqual({
      event: 'admin.bootstrap.refused',
      reason: 'unknown_option',
    });
    expect(run.output).not.toContain('desconocida@nimbo.me');
    expect(run.output).not.toContain('--correo');
  });

  it('CA-7: la política de sistema rechaza cualquier otro evento `SYSTEM` en un `run` sin actor', async () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const audit = new AuditService(
      new TypeOrmAuditRepository(database.context),
      database.runner,
      new SystemClock(),
      logger as never,
    );

    const otherSystemEvent = database.runner.run(() =>
      audit.recordInTransaction({
        action: AuditAction.PLAN_CREATED,
        actor: SYSTEM_ACTOR,
        targetUserId: null,
        resourceId: randomUUID(),
      }),
    );

    await expect(otherSystemEvent).rejects.toThrow(/row-level security/);
  });
});
