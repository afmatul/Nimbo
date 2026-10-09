import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { AuditAction, SYSTEM_ACTOR } from '../../../src/modules/audit';
import type { AuditRecord } from '../../../src/modules/audit';
import { AuditService } from '../../../src/modules/audit/application/audit.service';
import { TypeOrmAuditRepository } from '../../../src/modules/audit/infrastructure/persistence/typeorm-audit.repository';
import type { Actor } from '../../../src/shared';
import { createActor, Role, SystemClock } from '../../../src/shared';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { startRestrictedOwnerDatabase } from '../../isolation/setup/nosuperuser-postgres';
import type { RestrictedOwnerDatabase } from '../../isolation/setup/nosuperuser-postgres';
import { connectAsOwner, connectTo } from '../../support/database-urls';
import { inRolledBackTransaction, insertAccount } from '../storage/storage-test-db';

const AUDIT_MIGRATION = 'AmpliarEventoAuditoriaParaAccionesInternas20261007100300';

/** Restricciones, políticas, nulabilidad del afectado y RLS de `evento_auditoria`: lo que cambia la migración de 011. */
const AUDIT_SCHEMA_SQL = `SELECT
  (SELECT json_agg(json_build_array(k.conname, pg_get_constraintdef(k.oid)) ORDER BY k.conname) FROM pg_constraint k
    WHERE k.conrelid = 'evento_auditoria'::regclass) AS restricciones,
  (SELECT json_agg(json_build_array(p.policyname, p.cmd, p.with_check) ORDER BY p.policyname) FROM pg_policies p
    WHERE p.tablename = 'evento_auditoria') AS politicas,
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'evento_auditoria' AND column_name = 'usuario_afectado_id') AS afectado_nulo,
  (SELECT json_build_array(relrowsecurity, relforcerowsecurity) FROM pg_class
    WHERE oid = 'evento_auditoria'::regclass) AS rls`;

interface AuditSchema {
  readonly restricciones: [string, string][];
  readonly politicas: [string, string, string][];
  readonly afectado_nulo: 'YES' | 'NO';
  readonly rls: [boolean, boolean];
}

const auditSchemaOf = async (dataSource: DataSource): Promise<AuditSchema> =>
  ((await dataSource.query(AUDIT_SCHEMA_SQL)) as AuditSchema[])[0] as AuditSchema;

const appliedNames = async (dataSource: DataSource): Promise<string[]> =>
  ((await dataSource.query('SELECT name FROM migracion ORDER BY id')) as { name: string }[]).map(
    (row) => row.name,
  );

const onAccount = (action: AuditAction, actor: Actor, targetUserId: string): AuditRecord => ({
  action,
  actor,
  targetUserId,
  resourceId: targetUserId,
});

/**
 * Migraciones de 011 (plan §3). El ciclo `up → down → up` corre con un dueño **sin** `SUPERUSER` (como en producción,
 * ADR-0021): con `FORCE` RLS, un `down` que borrara sin quitar antes `FORCE` no borraría nada y el `SET NOT NULL`
 * fallaría. Las restricciones se comprueban en la base del arnés, en una transacción que se revierte.
 */
describe('migración ampliar-evento-auditoria con dueño NOSUPERUSER (011 plan §3)', () => {
  let database: RestrictedOwnerDatabase;
  let owner: DataSource;
  let app: DataSource;
  let context: TransactionContext;
  let runner: TypeOrmTransactionRunner;
  let audit: AuditService;
  let client: Actor;
  let admin: Actor;

  const newActor = async (role: Role): Promise<Actor> =>
    createActor(await owner.transaction((manager) => insertAccount(manager, role)), role);

  /** Un evento de 004 que el `down` conserva y los tres tipos de 011 que borra. */
  const seedEvents = async (): Promise<void> => {
    const write = (actor: Actor, record: AuditRecord) =>
      runner.withActor(actor, () => audit.recordInTransaction(record));
    await write(client, {
      action: AuditAction.TRASH_EMPTIED,
      actor: client,
      targetUserId: client.id,
    });
    await write(admin, onAccount(AuditAction.ACCOUNT_SUSPENDED, admin, client.id));
    await write(admin, {
      action: AuditAction.PLAN_CREATED,
      actor: admin,
      targetUserId: null,
      resourceId: randomUUID(),
    });
    await runner.run(() =>
      audit.recordInTransaction({
        action: AuditAction.ACCOUNT_BOOTSTRAP_ADMIN,
        actor: SYSTEM_ACTOR,
        targetUserId: null,
        resourceId: admin.id,
      }),
    );
  };

  /** Lo que `client` lee de su actividad como `nimbo_app` (el dueño, con `FORCE` y sin política, no ve filas). */
  const clientActions = async (): Promise<string[]> => {
    const actions = (await runner.withActor(client, () =>
      context
        .requireActorScope(client)
        .query('SELECT accion FROM evento_auditoria ORDER BY accion'),
    )) as { accion: string }[];
    return actions.map((row) => row.accion);
  };

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    runner = new TypeOrmTransactionRunner(app, context);
    audit = new AuditService(new TypeOrmAuditRepository(context), runner, new SystemClock(), {
      info: jest.fn(),
      error: jest.fn(),
    } as never);
    client = await newActor(Role.CLIENT);
    admin = await newActor(Role.ADMIN);
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  it('el dueño que migra no es superusuario ni tiene BYPASSRLS (si no, la prueba pasaría en vacío)', async () => {
    const [role] = (await owner.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    )) as { rolsuper: boolean; rolbypassrls: boolean }[];

    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('up → down → up: el `down` borra solo lo que 004 no admite, restaura su esquema y el `up` vuelve al de 011', async () => {
    await seedEvents();
    const applied = await appliedNames(owner);
    const reverted = applied.slice(applied.indexOf(AUDIT_MIGRATION));
    const schemaOf011 = await auditSchemaOf(owner);

    for (const _ of reverted) await owner.undoLastMigration({ transaction: 'each' });

    const schemaOf004 = await auditSchemaOf(owner);
    expect(await clientActions()).toEqual(['trash.emptied']);
    expect(schemaOf004.afectado_nulo).toBe('NO');
    expect(schemaOf004.rls).toEqual([true, true]);
    expect(schemaOf004.politicas.map(([name]) => name)).toEqual([
      'evento_auditoria_alta',
      'evento_auditoria_lectura',
    ]);
    expect(schemaOf004.restricciones).toEqual(
      expect.arrayContaining([
        [
          'evento_auditoria_rol_actor_check',
          "CHECK ((rol_actor = ANY (ARRAY['CLIENT'::text, 'ADMIN'::text, 'SUPPORT'::text, 'OPERATOR'::text])))",
        ],
        [
          'evento_auditoria_tipo_recurso_check',
          "CHECK ((tipo_recurso = ANY (ARRAY['file'::text, 'folder'::text, 'upload'::text])))",
        ],
      ]),
    );

    const rerun = await owner.runMigrations({ transaction: 'each' });

    expect(rerun.map((migration) => migration.name)).toEqual(reverted);
    expect(await auditSchemaOf(owner)).toEqual(schemaOf011);
  });
});

describe('restricciones de `evento_auditoria` de 011 (plan §3)', () => {
  let harnessOwner: DataSource;

  beforeAll(async () => {
    harnessOwner = await connectAsOwner();
  });

  afterAll(async () => {
    await harnessOwner.destroy();
  });

  /** Inserta un evento como el dueño (superusuario en el arnés: sin RLS) sobre una cuenta nueva. */
  const insertEvent = (assignments: string) =>
    inRolledBackTransaction(harnessOwner, async (runner) => {
      const userId = await insertAccount(runner);
      await runner.query(
        `INSERT INTO evento_auditoria (id, accion, actor_id, rol_actor, usuario_afectado_id, tipo_recurso,
                                       recurso_id, ocurrido_en)
         SELECT gen_random_uuid(), e.accion, e.actor_id, e.rol_actor, e.afectado, e.tipo_recurso, e.recurso_id, now()
           FROM (SELECT ${assignments}) e`,
        [userId],
      );
    });

  const base = (overrides: Record<string, string>): string =>
    Object.entries({
      accion: "'account.suspended'",
      actor_id: 'NULL::uuid',
      rol_actor: "'ADMIN'",
      afectado: '$1::uuid',
      tipo_recurso: "'account'",
      recurso_id: '$1::uuid',
      ...overrides,
    })
      .map(([column, value]) => `${value} AS ${column}`)
      .join(', ');

  it.each([
    ['ck_evento_destino', 'una acción sobre la cuenta sin afectado', { afectado: 'NULL::uuid' }],
    [
      'ck_evento_destino',
      'un cambio de catálogo con afectado',
      { accion: "'plan.created'", tipo_recurso: "'plan'" },
    ],
    [
      'ck_evento_destino',
      'el alta inicial con afectado',
      { accion: "'account.bootstrap_admin'", rol_actor: "'SYSTEM'" },
    ],
    [
      'ck_evento_sistema',
      'un evento `SYSTEM` con actor',
      { rol_actor: "'SYSTEM'", actor_id: '$1::uuid' },
    ],
    ['ck_evento_rol_actor', 'un rol fuera de la lista', { rol_actor: "'ROOT'" }],
    ['ck_evento_tipo_recurso', 'un tipo de recurso fuera de la lista', { tipo_recurso: "'link'" }],
  ])('`%s` rechaza %s', async (constraint, _case, overrides) => {
    await expect(insertEvent(base(overrides))).rejects.toThrow(new RegExp(constraint));
  });

  it.each([
    ['una acción interna sobre la cuenta', {}],
    [
      'un cambio de catálogo sin afectado',
      { accion: "'plan.created'", tipo_recurso: "'plan'", afectado: 'NULL::uuid' },
    ],
    [
      'el alta inicial del sistema sin afectado',
      { accion: "'account.bootstrap_admin'", rol_actor: "'SYSTEM'", afectado: 'NULL::uuid' },
    ],
  ])('admite %s', async (_case, overrides) => {
    await expect(insertEvent(base(overrides))).resolves.toBeUndefined();
  });
});
