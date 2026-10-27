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
import { revertFrom } from '../billing/billing-test-db';
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

    // Otras specs (014, 009) intercalan migraciones con fecha entre las de 011: aquí solo importa el orden de las de 011.
    expect(applied.filter((name) => ELEVEN_MIGRATIONS.includes(name))).toEqual(ELEVEN_MIGRATIONS);
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

const ADJUSTMENTS_MIGRATION = 'CuotaExtraYAjusteDeVigencia20261026100000';
const ADJUSTMENT_FUNCTIONS = [
  'ajustar_cuota_extra(uuid, bigint, timestamptz)',
  'extender_vigencia(uuid, timestamptz)',
  'limites_de_cuenta(uuid)',
];
const PERSONAL_PLAN_ID = '10000000-0000-4000-8000-000000000001';
const PRO_PLAN_ID = '10000000-0000-4000-8000-000000000002';
const PRO_QUOTA = 107_374_182_400n;
const FIVE_GIB = 5_368_709_120n;
/** 2^53-1: el tope técnico de `plan + extra` (RN-1). */
const MAX_SAFE_BYTES = BigInt(Number.MAX_SAFE_INTEGER);
const BIGINT_MAX = 9_223_372_036_854_775_807n;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Guatemala está en UTC−6 todo el año: su medianoche son las 06:00 UTC (RN-1, RN-8). */
const GUATEMALA_OFFSET_MS = 6 * HOUR_MS;

/** Las 00:00 en Guatemala del día que empieza `days` días después de hoy (en Guatemala), con el reloj real. */
const guatemalaMidnightIn = (days: number): Date => {
  const local = Date.now() - GUATEMALA_OFFSET_MS;
  return new Date(local - (local % DAY_MS) + days * DAY_MS + GUATEMALA_OFFSET_MS);
};

const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

/** Lo que la migración de 011b cambia en `suscripcion`: columnas, CHECK, políticas y funciones. */
const ADJUSTMENTS_SCHEMA_SQL = `SELECT
  (SELECT json_agg(c.column_name ORDER BY c.column_name) FROM information_schema.columns c
    WHERE c.table_name = 'suscripcion' AND c.column_name LIKE 'cuota_extra_%') AS columnas,
  (SELECT json_agg(pg_get_constraintdef(k.oid)) FROM pg_constraint k
    WHERE k.conrelid = 'suscripcion'::regclass AND k.conname = 'ck_suscripcion_cuota_extra') AS restricciones,
  (SELECT json_agg(json_build_array(p.policyname, p.cmd, p.roles::text, p.qual, p.with_check)
                   ORDER BY p.policyname)
     FROM pg_policies p WHERE p.tablename = 'suscripcion') AS politicas,
  (SELECT json_agg(json_build_array(f.proname, f.provolatile, f.prosecdef, f.proconfig) ORDER BY f.proname)
     FROM pg_proc f WHERE f.proname IN ('limites_de_cuenta', 'ajustar_cuota_extra', 'extender_vigencia'))
    AS funciones`;

type PolicyRow = [string, string, string, string | null, string | null];

interface AdjustmentsSchema {
  readonly columnas: string[] | null;
  readonly restricciones: string[] | null;
  readonly politicas: PolicyRow[];
  readonly funciones: [string, string, boolean, string[]][] | null;
}

/** La vista que devuelven las tres funciones (bytes como texto, como los entrega `pg`). */
interface LimitsRow {
  readonly plan_slug: string | null;
  readonly plan_nombre: string | null;
  readonly cuota_plan: string | null;
  readonly estado: string | null;
  readonly vence_en: Date | null;
  readonly extra: string | null;
  readonly hasta: Date | null;
  readonly espacio_usado: string | null;
  readonly cuota_total: string | null;
}

interface ResultRow extends LimitsRow {
  readonly codigo: string;
}

/** `extender_vigencia` suma si la cuenta salió de solo lectura (para `subscription.read_only_exited`). */
interface ValidityRow extends ResultRow {
  readonly salio_de_solo_lectura: boolean;
}

/** La fila completa como la lee el propio cliente: para comprobar que «nada cambia». */
type StoredSubscription = Record<string, unknown>;

/** La suscripción que se le arma al cliente: Pro con `vence_en`, o lo que pida la prueba. */
interface SeededSubscription {
  readonly planId?: string;
  readonly expiresAt?: Date | null;
  readonly readOnly?: boolean;
  readonly usedBytes?: bigint;
}

/**
 * Migración de 011b (plan §3, ADR-0035) con un dueño **sin** `SUPERUSER`: bajo `FORCE` RLS, sin la política
 * `suscripcion_ajuste_administracion` las funciones `SECURITY DEFINER` no podrían bloquear ni actualizar la fila. Las
 * funciones son la fuente de verdad de las reglas que dependen del estado; aquí se prueban sus códigos de resultado.
 */
describe('migración de 011b: cuota extra y ajuste de vigencia con dueño NOSUPERUSER (plan §3)', () => {
  let database: RestrictedOwnerDatabase;
  let owner: DataSource;
  let app: DataSource;
  let context: TransactionContext;
  let runner: TypeOrmTransactionRunner;
  let ownerContext: TransactionContext;
  let ownerRunner: TypeOrmTransactionRunner;
  let admin: Actor;

  const as = async <T>(actor: Actor, sql: string, params: unknown[] = []): Promise<T> =>
    (await runner.withActor(actor, () => context.requireActorScope(actor).query(sql, params))) as T;

  const adjustmentsSchemaOf = (): Promise<AdjustmentsSchema> =>
    firstRow<AdjustmentsSchema>(owner, ADJUSTMENTS_SCHEMA_SQL);

  const newClient = async (): Promise<Actor> =>
    createActor(await insertAccount(owner, Role.CLIENT), Role.CLIENT);

  const setUsedBytes = (userId: string, bytes: bigint): Promise<unknown> =>
    owner.query('UPDATE usuario SET espacio_usado = $2 WHERE id = $1', [userId, bytes.toString()]);

  /** Un cliente con su suscripción dada de alta por él mismo (`suscripcion_cliente_alta`) y su espacio usado. */
  const aClientWith = async (seed: SeededSubscription = {}): Promise<Actor> => {
    const client = await newClient();
    await as(
      client,
      'INSERT INTO suscripcion (usuario_id, plan_id, vence_en, estado) VALUES ($1, $2, $3, $4)',
      [
        client.id,
        seed.planId ?? PRO_PLAN_ID,
        seed.expiresAt === undefined ? guatemalaMidnightIn(10) : seed.expiresAt,
        seed.readOnly === true ? 'solo_lectura' : 'vigente',
      ],
    );
    await setUsedBytes(client.id, seed.usedBytes ?? 0n);
    return client;
  };

  /** El dueño escribe con la política del Administrador, como lo haría la función (para preparar un caso). */
  const asOwnerWithAdminRole = (sql: string, params: unknown[]): Promise<unknown> =>
    ownerRunner.withActor(admin, () => ownerContext.requireActorScope(admin).query(sql, params));

  const storedOf = async (client: Actor): Promise<StoredSubscription> =>
    (
      await as<StoredSubscription[]>(client, 'SELECT * FROM suscripcion WHERE usuario_id = $1', [
        client.id,
      ])
    )[0] as StoredSubscription;

  const adjustQuota = async (
    userId: string,
    extra: bigint,
    until: Date | null,
  ): Promise<ResultRow> =>
    (
      await as<ResultRow[]>(admin, 'SELECT * FROM ajustar_cuota_extra($1, $2, $3)', [
        userId,
        extra.toString(),
        until,
      ])
    )[0] as ResultRow;

  const extendValidity = async (userId: string, expiresAt: Date | null): Promise<ValidityRow> =>
    (
      await as<ValidityRow[]>(admin, 'SELECT * FROM extender_vigencia($1, $2)', [userId, expiresAt])
    )[0] as ValidityRow;

  const limitsOf = (userId: string): Promise<LimitsRow[]> =>
    as<LimitsRow[]>(admin, 'SELECT * FROM limites_de_cuenta($1)', [userId]);

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    runner = new TypeOrmTransactionRunner(app, context);
    ownerContext = new TransactionContext(owner);
    ownerRunner = new TypeOrmTransactionRunner(owner, ownerContext);
    admin = createActor(await insertAccount(owner, Role.ADMIN), Role.ADMIN);
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  describe('esquema (plan §3, ADR-0035 §5)', () => {
    it('`suscripcion` suma el extra y su fecha, con su CHECK y la política del dueño solo para ADMIN', async () => {
      const schema = await adjustmentsSchemaOf();
      const clientInsert = schema.politicas.find(([name]) => name === 'suscripcion_cliente_alta');

      expect(schema.columnas).toEqual(['cuota_extra_bytes', 'cuota_extra_hasta']);
      expect(schema.restricciones?.[0]).toMatch(/cuota_extra_bytes >= 0.*9007199254740991/);
      expect(schema.politicas).toContainEqual([
        'suscripcion_ajuste_administracion',
        'UPDATE',
        '{nimbo_dueno_restringido}',
        "(nimbo_actor_role() = 'ADMIN'::text)",
        "(nimbo_actor_role() = 'ADMIN'::text)",
      ]);
      expect(clientInsert?.[4]).toMatch(/cuota_extra_bytes = 0.*cuota_extra_hasta IS NULL/);
    });

    it('ADR-0035: lectura `STABLE` y escrituras `VOLATILE`, todas `SECURITY DEFINER` con `search_path` cerrado', async () => {
      const { funciones } = await adjustmentsSchemaOf();
      const closedPath = ['search_path=pg_catalog, pg_temp'];

      expect(funciones).toEqual([
        ['ajustar_cuota_extra', 'v', true, closedPath],
        ['extender_vigencia', 'v', true, closedPath],
        ['limites_de_cuenta', 's', true, closedPath],
      ]);
    });

    it('ADR-0035: `PUBLIC` no ejecuta ninguna; `nimbo_app` sí, pero no puede actualizar el extra', async () => {
      const privileges = (await owner.query(
        `SELECT has_function_privilege('public', f, 'EXECUTE') AS public,
                has_function_privilege('nimbo_app', f, 'EXECUTE') AS app
           FROM unnest($1::text[]) AS f ORDER BY f`,
        [ADJUSTMENT_FUNCTIONS],
      )) as { public: boolean; app: boolean }[];
      const columns = await firstRow<{ extra: boolean; hasta: boolean }>(
        owner,
        `SELECT has_column_privilege('nimbo_app', 'suscripcion', 'cuota_extra_bytes', 'UPDATE') AS extra,
                has_column_privilege('nimbo_app', 'suscripcion', 'cuota_extra_hasta', 'UPDATE') AS hasta`,
      );

      expect(privileges).toEqual(ADJUSTMENT_FUNCTIONS.map(() => ({ public: false, app: true })));
      expect(columns).toEqual({ extra: false, hasta: false });
    });

    it.each([
      ['un extra sin fecha', '1', () => null],
      ['una fecha sin extra', '0', () => guatemalaMidnightIn(2)],
      ['un extra negativo', '-1', () => guatemalaMidnightIn(2)],
      ['un extra mayor que 2^53-1', (MAX_SAFE_BYTES + 1n).toString(), () => guatemalaMidnightIn(2)],
    ])('el CHECK no admite %s', async (_case, extra, until) => {
      const client = await aClientWith();

      await expect(
        asOwnerWithAdminRole(
          'UPDATE suscripcion SET cuota_extra_bytes = $2, cuota_extra_hasta = $3 WHERE usuario_id = $1',
          [client.id, extra, until()],
        ),
      ).rejects.toThrow(/ck_suscripcion_cuota_extra/);
    });
  });

  describe('`limites_de_cuenta` y `ajustar_cuota_extra` (CA-1 a CA-4, RN-1)', () => {
    it('CA-1: el extra se escribe bajo `FORCE` RLS y la vista da la cuota del plan más el extra', async () => {
      const client = await aClientWith({ usedBytes: 1024n });
      const until = guatemalaMidnightIn(3);
      const view = {
        plan_slug: 'pro',
        plan_nombre: 'Pro',
        cuota_plan: PRO_QUOTA.toString(),
        estado: 'vigente',
        extra: FIVE_GIB.toString(),
        hasta: until,
        espacio_usado: '1024',
        cuota_total: (PRO_QUOTA + FIVE_GIB).toString(),
      };

      const result = await adjustQuota(client.id, FIVE_GIB, until);

      expect(result).toMatchObject({ codigo: 'ok', ...view });
      expect(await limitsOf(client.id)).toEqual([expect.objectContaining(view)]);
      expect(await storedOf(client)).toMatchObject({
        cuota_extra_bytes: FIVE_GIB.toString(),
        cuota_extra_hasta: until,
      });
    });

    it('CA-3: sin suscripción la lectura no devuelve filas', async () => {
      expect(await limitsOf((await newClient()).id)).toEqual([]);
    });

    it('CA-3: una cuenta interna no devuelve filas, aunque tenga una fila de `suscripcion`', async () => {
      // Se da de alta con la política del cliente: la sesión dice `CLIENT`, pero `usuario.rol` es `SUPPORT`.
      const support = createActor(await insertAccount(owner, Role.SUPPORT), Role.CLIENT);
      await as(support, 'INSERT INTO suscripcion (usuario_id, plan_id) VALUES ($1, $2)', [
        support.id,
        PRO_PLAN_ID,
      ]);

      expect(
        await as<unknown[]>(support, 'SELECT 1 FROM suscripcion WHERE usuario_id = $1', [
          support.id,
        ]),
      ).toHaveLength(1);
      expect(await limitsOf(support.id)).toEqual([]);
    });

    it('CA-4, RN-1: un extra vencido no cuenta en la vista, sin trabajo programado', async () => {
      const client = await aClientWith();
      await adjustQuota(client.id, FIVE_GIB, guatemalaMidnightIn(3));

      await asOwnerWithAdminRole(
        "UPDATE suscripcion SET cuota_extra_hasta = now() - interval '1 second' WHERE usuario_id = $1",
        [client.id],
      );

      expect(await limitsOf(client.id)).toEqual([
        expect.objectContaining({ extra: '0', hasta: null, cuota_total: PRO_QUOTA.toString() }),
      ]);
    });

    it('CA-2: si `plan + extra < usado` responde `quota_below_usage` con el usado y no cambia nada', async () => {
      const used = PRO_QUOTA + FIVE_GIB + 1n;
      const client = await aClientWith({ usedBytes: used });
      const before = await storedOf(client);

      const result = await adjustQuota(client.id, FIVE_GIB, guatemalaMidnightIn(3));

      expect(result).toMatchObject({
        codigo: 'quota_below_usage',
        cuota_plan: PRO_QUOTA.toString(),
        espacio_usado: used.toString(),
      });
      expect(await storedOf(client)).toEqual(before);
    });

    it('CA-2: el borde exacto `plan + extra = usado` se acepta', async () => {
      const client = await aClientWith({ usedBytes: PRO_QUOTA + FIVE_GIB });

      expect(await adjustQuota(client.id, FIVE_GIB, guatemalaMidnightIn(3))).toMatchObject({
        codigo: 'ok',
      });
    });

    it.each([
      ['un extra de cero con fecha', 0n, () => guatemalaMidnightIn(3)],
      ['un extra sin fecha', FIVE_GIB, () => null],
      ['una fecha pasada', FIVE_GIB, () => daysAgo(1)],
      ['un extra negativo', -1n, () => guatemalaMidnightIn(3)],
      ['un total mayor que 2^53-1', MAX_SAFE_BYTES - PRO_QUOTA + 1n, () => guatemalaMidnightIn(3)],
      ['el mayor `bigint` (sin desbordar la suma)', BIGINT_MAX, () => guatemalaMidnightIn(3)],
    ])('CA-3: %s es `quota_invalid` y no cambia nada', async (_case, extra, until) => {
      const client = await aClientWith();
      const before = await storedOf(client);

      expect(await adjustQuota(client.id, extra, until())).toMatchObject({
        codigo: 'quota_invalid',
      });
      expect(await storedOf(client)).toEqual(before);
    });

    it('CA-3: sin suscripción es `no_subscription`; una interna o inexistente, `account_not_found`', async () => {
      const support = await insertAccount(owner, Role.SUPPORT);
      const until = guatemalaMidnightIn(3);

      expect(await adjustQuota((await newClient()).id, FIVE_GIB, until)).toMatchObject({
        codigo: 'no_subscription',
        plan_slug: null,
      });
      expect(await adjustQuota(support, FIVE_GIB, until)).toMatchObject({
        codigo: 'account_not_found',
        plan_slug: null,
      });
      expect(await adjustQuota(randomUUID(), FIVE_GIB, until)).toMatchObject({
        codigo: 'account_not_found',
      });
    });

    it('CA-4: quitar (`0`/`NULL`) solo se admite si la cuota del plan cubre lo usado', async () => {
      const client = await aClientWith();
      await adjustQuota(client.id, FIVE_GIB, guatemalaMidnightIn(3));

      await setUsedBytes(client.id, PRO_QUOTA + 1n);
      expect(await adjustQuota(client.id, 0n, null)).toMatchObject({
        codigo: 'quota_below_usage',
      });

      await setUsedBytes(client.id, PRO_QUOTA);
      expect(await adjustQuota(client.id, 0n, null)).toMatchObject({
        codigo: 'ok',
        extra: '0',
        hasta: null,
        cuota_total: PRO_QUOTA.toString(),
      });
    });

    it('RN-1, CA-18: ajustar la cuota no toca `vence_en`, el estado ni los avisos', async () => {
      const client = await aClientWith({ expiresAt: daysAgo(1), readOnly: true });
      const before = await storedOf(client);
      const until = guatemalaMidnightIn(3);

      await adjustQuota(client.id, FIVE_GIB, until);

      expect(await storedOf(client)).toEqual({
        ...before,
        cuota_extra_bytes: FIVE_GIB.toString(),
        cuota_extra_hasta: until,
        actualizado_en: expect.any(Date),
      });
    });
  });

  describe('`extender_vigencia` (CA-6 a CA-8, RN-2, RN-8)', () => {
    it('CA-6, CA-8: saca de solo lectura y no toca avisos, renovación, cambio programado ni `iniciado_en`', async () => {
      const client = await aClientWith({ expiresAt: daysAgo(1), readOnly: true });
      const before = await storedOf(client);
      const expiresAt = guatemalaMidnightIn(30);

      const result = await extendValidity(client.id, expiresAt);

      expect(result).toMatchObject({
        codigo: 'ok',
        estado: 'vigente',
        vence_en: expiresAt,
        salio_de_solo_lectura: true,
      });
      expect(await storedOf(client)).toEqual({
        ...before,
        vence_en: expiresAt,
        estado: 'vigente',
        actualizado_en: expect.any(Date),
      });
    });

    it.each([
      ['a medianoche', 0],
      ['con hora intermedia (010), 09:00 en Guatemala', 15 * HOUR_MS],
    ])(
      'CA-7, RN-8: con `vence_en` %s, el día que se muestra no basta; el siguiente, sí',
      async (_case, beforeDayEndMs) => {
        const lastShownDayEnd = guatemalaMidnightIn(10);
        const expiresAt = new Date(lastShownDayEnd.getTime() - beforeDayEndMs);
        const client = await aClientWith({ expiresAt });
        const before = await storedOf(client);

        expect(await extendValidity(client.id, lastShownDayEnd)).toMatchObject({
          codigo: 'validity_not_extended',
        });
        expect(await storedOf(client)).toEqual(before);
        expect(
          await extendValidity(client.id, new Date(lastShownDayEnd.getTime() + DAY_MS)),
        ).toMatchObject({ codigo: 'ok', salio_de_solo_lectura: false });
      },
    );

    it('RN-2: la fecha nueva debe ser posterior a ahora, aunque `vence_en` ya haya pasado', async () => {
      const client = await aClientWith({ expiresAt: daysAgo(3) });

      expect(await extendValidity(client.id, daysAgo(1))).toMatchObject({
        codigo: 'validity_not_extended',
      });
      expect(await extendValidity(client.id, null)).toMatchObject({
        codigo: 'validity_not_extended',
      });
    });

    it('CA-7: Personal es `personal`; sin suscripción, `no_subscription`; interna o inexistente, `account_not_found`', async () => {
      const personal = await aClientWith({ planId: PERSONAL_PLAN_ID, expiresAt: null });
      const operator = await insertAccount(owner, Role.OPERATOR);
      const expiresAt = guatemalaMidnightIn(30);

      expect(await extendValidity(personal.id, expiresAt)).toMatchObject({
        codigo: 'personal',
        vence_en: null,
        salio_de_solo_lectura: false,
      });
      expect(await extendValidity((await newClient()).id, expiresAt)).toMatchObject({
        codigo: 'no_subscription',
      });
      expect(await extendValidity(operator, expiresAt)).toMatchObject({
        codigo: 'account_not_found',
      });
      expect(await extendValidity(randomUUID(), expiresAt)).toMatchObject({
        codigo: 'account_not_found',
        salio_de_solo_lectura: false,
      });
    });

    it('CA-18: rechazar una cuenta en solo lectura no la saca; solo `extender_vigencia` dice si salió', async () => {
      const client = await aClientWith({ expiresAt: daysAgo(1), readOnly: true });

      const rejected = await extendValidity(client.id, daysAgo(1));

      expect(rejected).toMatchObject({
        codigo: 'validity_not_extended',
        estado: 'solo_lectura',
        salio_de_solo_lectura: false,
      });
      expect(Object.keys((await limitsOf(client.id))[0] ?? {})).not.toContain(
        'salio_de_solo_lectura',
      );
      expect(
        Object.keys(await adjustQuota(client.id, FIVE_GIB, guatemalaMidnightIn(3))),
      ).not.toContain('salio_de_solo_lectura');
    });
  });

  it('up → down → up: el `down` quita columnas, CHECK, política y funciones, y restaura el alta del cliente', async () => {
    const before = await adjustmentsSchemaOf();

    const reverted = await revertFrom(owner, ADJUSTMENTS_MIGRATION);

    const down = await adjustmentsSchemaOf();
    expect(reverted[0]).toBe(ADJUSTMENTS_MIGRATION);
    expect(down).toMatchObject({ columnas: null, restricciones: null, funciones: null });
    expect(down.politicas.map(([name]) => name)).not.toContain('suscripcion_ajuste_administracion');
    expect(down.politicas).toContainEqual([
      'suscripcion_cliente_alta',
      'INSERT',
      '{nimbo_app}',
      null,
      "((nimbo_actor_role() = 'CLIENT'::text) AND (usuario_id = nimbo_actor_id()))",
    ]);

    const rerun = await owner.runMigrations({ transaction: 'each' });
    expect(rerun.map((migration) => migration.name)).toEqual(reverted);
    expect(await adjustmentsSchemaOf()).toEqual(before);
  });
});
