import { randomUUID } from 'node:crypto';

import type { DataSource, QueryRunner } from 'typeorm';

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
import { aClient, insertUser, violatedConstraint } from '../identity/identity-rows';
import { inRolledBackTransaction, insertAccount } from '../storage/storage-test-db';

/** La primera migración de 011 (plan §3): el ciclo revierte desde ella (y todas las posteriores). */
const FIRST_011_MIGRATION = 'AgregarCodigoEmpleadoAUsuario20261007100000';
const ELEVEN_MIGRATIONS = [
  FIRST_011_MIGRATION,
  'AgregarAltaInternaATokenCuenta20261007100100',
  'AmpliarEventoAuditoriaParaAccionesInternas20261007100300',
  'IndiceMetadatosDeArchivo20261007100400',
  'AgregarDesactivadoEnAPlan20261014160000',
];

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

/** Lo que las migraciones de 011 cambian en `usuario`, `token_cuenta` y `archivo`. */
const ACCOUNT_SCHEMA_SQL = `SELECT
  (SELECT json_agg(json_build_array(k.conname, pg_get_constraintdef(k.oid)) ORDER BY k.conname) FROM pg_constraint k
    WHERE k.conrelid IN ('usuario'::regclass, 'token_cuenta'::regclass) AND k.contype = 'c') AS restricciones,
  (SELECT json_agg(i.indexdef ORDER BY i.indexname) FROM pg_indexes i
    WHERE i.tablename IN ('usuario', 'archivo')) AS indices,
  (SELECT json_agg(c.column_name ORDER BY c.column_name) FROM information_schema.columns c
    WHERE c.table_name = 'usuario') AS columnas_usuario`;

interface AuditSchema {
  readonly restricciones: [string, string][];
  readonly politicas: [string, string, string][];
  readonly afectado_nulo: 'YES' | 'NO';
  readonly rls: [boolean, boolean];
}

interface AccountSchema {
  readonly restricciones: [string, string][];
  readonly indices: string[];
  readonly columnas_usuario: string[];
}

const firstRow = async <T>(dataSource: DataSource, sql: string): Promise<T> =>
  ((await dataSource.query(sql)) as T[])[0] as T;

const auditSchemaOf = (dataSource: DataSource): Promise<AuditSchema> =>
  firstRow<AuditSchema>(dataSource, AUDIT_SCHEMA_SQL);

const accountSchemaOf = (dataSource: DataSource): Promise<AccountSchema> =>
  firstRow<AccountSchema>(dataSource, ACCOUNT_SCHEMA_SQL);

/** Lo que la migración de `billing` de 011 (T-09) agrega a `plan`: columna, CHECK e índice único. */
const PLAN_SCHEMA_SQL = `SELECT
  (SELECT json_agg(c.column_name ORDER BY c.column_name) FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'plan') AS columnas,
  (SELECT json_agg(k.conname ORDER BY k.conname) FROM pg_constraint k
    WHERE k.conrelid = 'plan'::regclass AND k.contype = 'c' AND k.conname LIKE 'ck_plan_%') AS restricciones,
  (SELECT json_agg(i.indexname ORDER BY i.indexname) FROM pg_indexes i WHERE i.tablename = 'plan') AS indices`;

interface PlanSchema {
  readonly columnas: string[];
  readonly restricciones: string[] | null;
  readonly indices: string[];
}

const planSchemaOf = (dataSource: DataSource): Promise<PlanSchema> =>
  firstRow<PlanSchema>(dataSource, PLAN_SCHEMA_SQL);

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
describe('migraciones de 011 con dueño NOSUPERUSER (plan §3)', () => {
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

  /** Un enlace de alta interna vigente: el `down` lo borra antes de restaurar el CHECK de 001. */
  const seedSetupToken = (userId: string): Promise<unknown> =>
    owner.query(
      `INSERT INTO token_cuenta (usuario_id, tipo, token_hash, expira_en, creado_en)
       VALUES ($1, 'alta_interna', $2, now() + interval '1 day', now())`,
      [userId, 'c'.repeat(64)],
    );

  /** Lo que `client` lee de su actividad como `nimbo_app` (el dueño, con `FORCE` y sin política, no ve filas). */
  const clientActions = async (): Promise<string[]> => {
    const actions = (await runner.withActor(client, () =>
      context
        .requireActorScope(client)
        .query('SELECT accion FROM evento_auditoria ORDER BY accion'),
    )) as { accion: string }[];
    return actions.map((row) => row.accion);
  };

  const revertFrom011 = async (): Promise<string[]> => {
    const applied = await appliedNames(owner);
    const reverted = applied.slice(applied.indexOf(FIRST_011_MIGRATION));
    for (const _ of reverted) await owner.undoLastMigration({ transaction: 'each' });
    return reverted;
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

  it('las cinco migraciones de 011 corren en el orden de su fecha', async () => {
    const applied = await appliedNames(owner);

    expect(applied.slice(applied.indexOf(FIRST_011_MIGRATION))).toEqual(ELEVEN_MIGRATIONS);
  });

  it('up → down → up: el `down` borra solo lo que el esquema anterior no admite y el `up` vuelve al de 011', async () => {
    await seedEvents();
    await seedSetupToken(admin.id);
    const before = { audit: await auditSchemaOf(owner), accounts: await accountSchemaOf(owner) };
    const planBefore = await planSchemaOf(owner);
    expect(planBefore.columnas).toContain('desactivado_en');

    const reverted = await revertFrom011();

    const accounts = await accountSchemaOf(owner);
    const plan006a = await planSchemaOf(owner);
    expect(plan006a.columnas).not.toContain('desactivado_en');
    expect(plan006a.restricciones).toBeNull();
    expect(plan006a.indices).not.toContain('uq_plan_nombre');
    expect(await clientActions()).toEqual(['trash.emptied']);
    expect(accounts.columnas_usuario).not.toContain('codigo_empleado');
    expect(accounts.indices.join()).not.toContain('idx_archivo_propietario_actualizado');
    expect(accounts.restricciones).toContainEqual([
      'ck_token_cuenta_tipo',
      "CHECK (((tipo)::text = ANY ((ARRAY['verificacion'::character varying, 'recuperacion'::character varying])::text[])))",
    ]);
    const audit004 = await auditSchemaOf(owner);
    expect(audit004.afectado_nulo).toBe('NO');
    expect(audit004.rls).toEqual([true, true]);
    expect(audit004.politicas.map(([name]) => name)).toEqual([
      'evento_auditoria_alta',
      'evento_auditoria_lectura',
    ]);
    expect(audit004.restricciones).toEqual(
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

    await expect(owner.runMigrations({ transaction: 'each' })).rejects.toThrow(
      /cuentas internas sin código de empleado/,
    );
    await owner.query("DELETE FROM usuario WHERE rol <> 'CLIENT'");
    const rerun = await owner.runMigrations({ transaction: 'each' });

    expect(rerun.map((migration) => migration.name)).toEqual(reverted);
    expect({ audit: await auditSchemaOf(owner), accounts: await accountSchemaOf(owner) }).toEqual(
      before,
    );
    expect(await planSchemaOf(owner)).toEqual(planBefore);
  });
});

describe('restricciones de `usuario` y `token_cuenta` de 011 (plan §3, RN-5)', () => {
  let harnessOwner: DataSource;

  beforeAll(async () => {
    harnessOwner = await connectAsOwner();
  });

  afterAll(async () => {
    await harnessOwner.destroy();
  });

  const internal = (codigo: string | null) =>
    aClient({
      rol: 'SUPPORT',
      version_terminos: null,
      version_privacidad: null,
      terminos_aceptados_en: null,
      codigo_empleado: codigo,
    });

  const violationOf = (work: (runner: QueryRunner) => Promise<unknown>) =>
    inRolledBackTransaction(harnessOwner, (runner) => violatedConstraint(work(runner)));

  it.each([
    ['un cliente con código', aClient({ codigo_empleado: 'CLI-1' }), /_cliente$/],
    ['una interna sin código', internal(null), /_interna$/],
    ['un código con espacios', internal('SOP 014'), /_(formato|normalizado)$/],
    ['un código en minúsculas', internal('sop-014'), /_(formato|normalizado)$/],
  ])('RN-5: rechaza %s', async (_case, row, constraint) => {
    const violated = await violationOf((runner) => insertUser(runner, row));

    expect(violated).toMatch(/^ck_usuario_codigo_empleado/);
    expect(violated).toMatch(constraint);
  });

  it('RN-5: un código de 21 caracteres no cabe en la columna (`varchar(20)`)', async () => {
    await expect(
      inRolledBackTransaction(harnessOwner, (runner) =>
        insertUser(runner, internal('A'.repeat(21))),
      ),
    ).rejects.toThrow(/value too long/);
  });

  it('RN-5: el código de empleado es único entre las internas', async () => {
    const violated = await violationOf(async (runner) => {
      await insertUser(runner, internal('SOP-014'));
      await insertUser(runner, internal('SOP-014'));
    });

    expect(violated).toBe('uq_usuario_codigo_empleado');
  });

  it('RN-5: admite una interna con un código de 1 a 20 caracteres y un cliente sin código', async () => {
    const violated = await violationOf(async (runner) => {
      await insertUser(runner, internal('A'));
      await insertUser(runner, internal('OPS-2026-0001-ABCDEF'));
      await insertUser(runner, aClient());
    });

    expect(violated).toBeUndefined();
  });

  it('CA-5: `token_cuenta` admite el tipo `alta_interna` y sigue rechazando uno desconocido', async () => {
    const insertToken = (runner: QueryRunner, userId: string, tipo: string) =>
      runner.query(
        `INSERT INTO token_cuenta (usuario_id, tipo, token_hash, expira_en, creado_en)
         VALUES ($1, $2, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day', now())`,
        [userId, tipo],
      );
    const row = internal('SOP-777');

    const accepted = await violationOf(async (runner) => {
      await insertUser(runner, row);
      await insertToken(runner, row.id, 'alta_interna');
    });
    const rejected = await violationOf(async (runner) => {
      await insertUser(runner, row);
      await insertToken(runner, row.id, 'invitacion');
    });

    expect(accepted).toBeUndefined();
    expect(rejected).toBe('ck_token_cuenta_tipo');
  });

  it('CA-13: `archivo` tiene el índice de la lista de metadatos por dueño', async () => {
    const [row] = (await harnessOwner.query(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_archivo_propietario_actualizado'",
    )) as { indexdef: string }[];

    expect(row?.indexdef).toContain('(propietario_id, actualizado_en DESC, id DESC)');
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
    [
      'ck_evento_bootstrap_sistema',
      'el alta inicial registrada por un interno',
      { accion: "'account.bootstrap_admin'", afectado: 'NULL::uuid' },
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
