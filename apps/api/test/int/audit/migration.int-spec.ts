import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { columnsOf, inRolledBackTransaction, insertAccount } from '../storage/storage-test-db';

/**
 * Migración de `evento_auditoria` (spec 004 D-7, D-9; plan §3) sobre el Postgres del arnés, como el dueño de las
 * tablas. Los casos de esquema corren en una transacción que se revierte; el ciclo `up/down/up` usa una base nueva.
 * El esquema que se comprueba es el vigente: 011 (plan §3) admite afectado nulo, renombra los CHECK de rol y tipo de
 * recurso y suma la política `evento_auditoria_alta_sistema`; el detalle de 011 está en
 * `test/int/backoffice/migrations.int-spec.ts`.
 */
const AUDIT_MIGRATION = 'CrearEventoAuditoria20261005100000';

let owner: DataSource;

beforeAll(async () => {
  owner = await connectAsOwner();
});

afterAll(async () => {
  await owner.destroy();
});

describe('migración crear-evento-auditoria: esquema (DF-12)', () => {
  it('CA-1: `evento_auditoria` tiene las columnas del plan con sus tipos y nulabilidad', async () => {
    const columns = await inRolledBackTransaction(owner, (runner) =>
      columnsOf(runner, 'evento_auditoria'),
    );

    expect(Object.keys(columns).sort()).toEqual([
      'accion',
      'actor_id',
      'atributos',
      'correlation_id',
      'id',
      'ocurrido_en',
      'recurso_id',
      'rol_actor',
      'tipo_recurso',
      'usuario_afectado_id',
    ]);
    expect(columns['actor_id']?.nullable).toBe(true);
    expect(columns['usuario_afectado_id']).toEqual({
      type: 'uuid',
      nullable: true,
      default: null,
    });
    expect(columns['atributos']).toEqual({
      type: 'jsonb',
      nullable: false,
      default: "'{}'::jsonb",
    });
    expect(columns['ocurrido_en']).toEqual({
      type: 'timestamp with time zone',
      nullable: false,
      default: null,
    });
  });

  it('CA-9: el único índice secundario es `(usuario_afectado_id, ocurrido_en DESC, id DESC)`', async () => {
    const rows = (await owner.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'evento_auditoria' ORDER BY indexname",
    )) as { indexname: string; indexdef: string }[];

    expect(rows.map((row) => row.indexname)).toEqual([
      'evento_auditoria_pkey',
      'idx_evento_afectado_fecha',
    ]);
    expect(rows[1]?.indexdef).toContain('(usuario_afectado_id, ocurrido_en DESC, id DESC)');
  });

  it('CA-6: tiene RLS habilitada y forzada, con solo las políticas de lectura y alta (más la del sistema, 011)', async () => {
    const [rls] = (await owner.query(
      "SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE oid = 'evento_auditoria'::regclass",
    )) as { enabled: boolean; forced: boolean }[];
    const policies = (await owner.query(
      "SELECT policyname, cmd FROM pg_policies WHERE tablename = 'evento_auditoria' ORDER BY policyname",
    )) as { policyname: string; cmd: string }[];

    expect(rls).toEqual({ enabled: true, forced: true });
    expect(policies).toEqual([
      { policyname: 'evento_auditoria_alta', cmd: 'INSERT' },
      { policyname: 'evento_auditoria_alta_sistema', cmd: 'INSERT' },
      { policyname: 'evento_auditoria_lectura', cmd: 'SELECT' },
    ]);
  });

  it.each([
    ['ck_evento_recurso', "tipo_recurso = 'file', recurso_id = NULL"],
    ['ck_evento_rol_actor', "rol_actor = 'ROOT'"],
    ['ck_evento_tipo_recurso', "tipo_recurso = 'link', recurso_id = gen_random_uuid()"],
    ['evento_auditoria_atributos_check', "atributos = '[]'::jsonb"],
  ])('CA-4: `%s` rechaza una fila con %s', async (constraint, assignment) => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const userId = await insertAccount(runner);
        await runner.query(
          `INSERT INTO evento_auditoria (id, accion, rol_actor, usuario_afectado_id, ocurrido_en)
           VALUES (gen_random_uuid(), 'trash.emptied', 'CLIENT', $1, now())`,
          [userId],
        );
        await runner.query(`UPDATE evento_auditoria SET ${assignment}`);
      }),
    ).rejects.toThrow(new RegExp(constraint));
  });
});

describe('cierre de la migración de auditoría: `revert` y `run` tres veces sobre una base vacía (RNF-10)', () => {
  const CYCLES = 3;
  const databaseName = `nimbo_auditoria_${String(process.pid)}_${String(Date.now())}`;
  let fresh: DataSource;

  /** Lo que crea la migración: columnas, índices, restricciones, políticas, RLS y privilegios de `nimbo_app`. */
  const schemaOf = async (): Promise<unknown> =>
    fresh.query(
      `SELECT
         (SELECT json_agg(c ORDER BY c.column_name) FROM (
            SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'evento_auditoria') c) AS columnas,
         (SELECT json_agg(i.indexdef ORDER BY i.indexname) FROM pg_indexes i
           WHERE i.tablename = 'evento_auditoria') AS indices,
         (SELECT json_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k
           WHERE k.conrelid = to_regclass('evento_auditoria')) AS restricciones,
         (SELECT json_agg(json_build_array(p.policyname, p.cmd, p.qual, p.with_check) ORDER BY p.policyname)
            FROM pg_policies p WHERE p.tablename = 'evento_auditoria') AS politicas,
         (SELECT json_build_array(r.relrowsecurity, r.relforcerowsecurity) FROM pg_class r
           WHERE r.oid = to_regclass('evento_auditoria')) AS rls,
         (SELECT json_agg(g.privilege_type ORDER BY g.privilege_type) FROM information_schema.role_table_grants g
           WHERE g.table_name = 'evento_auditoria' AND g.grantee = 'nimbo_app') AS privilegios`,
    );

  const appliedNames = async (): Promise<string[]> =>
    ((await fresh.query('SELECT name FROM migracion ORDER BY id')) as { name: string }[]).map(
      (row) => row.name,
    );

  /** La de auditoría y las que vengan después: para revertirla hay que revertir antes las posteriores. */
  const fromAudit = (applied: readonly string[]): string[] =>
    applied.slice(applied.indexOf(AUDIT_MIGRATION));

  beforeAll(async () => {
    await owner.query(`CREATE DATABASE ${databaseName}`);
    const url = new URL(process.env['DATABASE_MIGRATION_URL'] ?? '');
    url.pathname = `/${databaseName}`;
    fresh = await new DataSource(
      buildDataSourceOptions({ DATABASE_URL: url.toString() }),
    ).initialize();
  });

  afterAll(async () => {
    await fresh.destroy();
    await owner.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  });

  it('RNF-10: la migración se revierte y vuelve a correr tres veces con el mismo esquema', async () => {
    await fresh.runMigrations({ transaction: 'each' });
    const applied = await appliedNames();
    const reverted = fromAudit(applied);
    const before = await schemaOf();

    expect(reverted[0]).toBe(AUDIT_MIGRATION);
    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      for (const _ of reverted) {
        await fresh.undoLastMigration({ transaction: 'each' });
      }
      const [gone] = (await fresh.query(
        "SELECT to_regclass('evento_auditoria')::text AS tabla",
      )) as { tabla: string | null }[];

      expect(await appliedNames()).toEqual(applied.slice(0, -reverted.length));
      expect(gone?.tabla).toBeNull();

      const rerun = await fresh.runMigrations({ transaction: 'each' });

      expect(rerun.map((migration) => migration.name)).toEqual(reverted);
      expect(await schemaOf()).toEqual(before);
    }
  });
});
