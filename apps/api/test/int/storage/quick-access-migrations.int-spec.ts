import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';

import { accessibleNodes } from '../../../src/modules/access';
import type { Actor } from '../../../src/shared';
import { buildDataSourceOptions, createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';

import type { AppDatabase, QuickAccessNode } from './storage-test-db';
import {
  columnsOf,
  connectAsAppDatabase,
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  insertFolder,
  insertQuickAccess,
  removeAccounts,
} from './storage-test-db';

/**
 * Migración de `acceso_rapido` (spec 006 CA-27 y CA-28, plan §9.2) sobre el Postgres del arnés, como el dueño de las
 * tablas. Los casos de esquema corren en una transacción que se revierte; los de RLS confirman *fixtures* como
 * `nimbo_app` dentro de `withActor` y las borran al final.
 */
const QUICK_ACCESS_MIGRATION = 'CrearAccesoRapido20261003100000';

let owner: DataSource;

beforeAll(async () => {
  owner = await connectAsOwner();
});

afterAll(async () => {
  await owner.destroy();
});

/** Cuenta con un archivo y una carpeta vivos, para colgarles accesos rápidos. */
const seedNodes = async (
  runner: QueryRunner,
): Promise<{ userId: string; file: QuickAccessNode; folder: QuickAccessNode }> => {
  const userId = await insertAccount(runner);
  const { fileId } = await insertFileWithVersion(runner, userId);
  const { id: folderId } = await insertFolder(runner, userId);
  return { userId, file: { fileId }, folder: { folderId } };
};

const countRows = async (runner: QueryRunner, userId: string): Promise<number> => {
  const [row] = (await runner.query(
    'SELECT count(*)::int AS n FROM acceso_rapido WHERE usuario_id = $1',
    [userId],
  )) as { n: number }[];
  return row?.n ?? 0;
};

describe('migración crear-acceso-rapido: columnas y restricciones (CA-27, CA-28)', () => {
  it('CA-27: `acceso_rapido` tiene las columnas del plan, sin columna `fijado` ni `nodo_id`', async () => {
    const columns = await inRolledBackTransaction(owner, (runner) =>
      columnsOf(runner, 'acceso_rapido'),
    );

    expect(Object.keys(columns).sort()).toEqual([
      'abierto_en',
      'actualizado_en',
      'archivo_id',
      'carpeta_id',
      'creado_en',
      'fijado_en',
      'id',
      'usuario_id',
    ]);
    expect(columns['usuario_id']).toEqual({ type: 'uuid', nullable: false, default: null });
    expect(columns['archivo_id']?.nullable).toBe(true);
    expect(columns['carpeta_id']?.nullable).toBe(true);
    expect(columns['fijado_en']).toEqual({
      type: 'timestamp with time zone',
      nullable: true,
      default: null,
    });
  });

  it.each([
    ['ck_acceso_un_nodo', 'sin nodo', 'UPDATE acceso_rapido SET archivo_id = NULL'],
    [
      'ck_acceso_un_nodo',
      'con los dos nodos',
      'UPDATE acceso_rapido q SET carpeta_id = (SELECT c.id FROM carpeta c WHERE c.propietario_id = q.usuario_id)',
    ],
    ['ck_acceso_util', 'sin ninguna marca', 'UPDATE acceso_rapido SET fijado_en = NULL'],
  ])('CA-27: `%s` rechaza una fila %s', async (constraint, _case, statement) => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const { userId, file } = await seedNodes(runner);
        await insertQuickAccess(runner, userId, file);
        await runner.query(statement);
      }),
    ).rejects.toThrow(new RegExp(constraint));
  });

  it.each([
    ['uq_acceso_archivo', 'file'],
    ['uq_acceso_carpeta', 'folder'],
  ] as const)(
    'CA-27: `%s` no deja dos filas de la misma cuenta sobre el mismo nodo',
    async (constraint, kind) => {
      await expect(
        inRolledBackTransaction(owner, async (runner) => {
          const nodes = await seedNodes(runner);
          await insertQuickAccess(runner, nodes.userId, nodes[kind]);
          await insertQuickAccess(runner, nodes.userId, nodes[kind], {
            pinnedAt: null,
            openedAt: new Date(),
          });
        }),
      ).rejects.toThrow(new RegExp(constraint));
    },
  );

  it('CA-27: otra cuenta puede tener su propia fila sobre el mismo nodo, y un archivo y una carpeta no chocan', async () => {
    const rows = await inRolledBackTransaction(owner, async (runner) => {
      const { userId, file, folder } = await seedNodes(runner);
      const other = await insertAccount(runner);
      await insertQuickAccess(runner, userId, file);
      await insertQuickAccess(runner, userId, folder, { pinnedAt: null, openedAt: new Date() });
      await insertQuickAccess(runner, other, file);
      return (await countRows(runner, userId)) + (await countRows(runner, other));
    });

    expect(rows).toBe(3);
  });

  it.each([
    ['archivo', 'file'],
    ['carpeta', 'folder'],
  ] as const)(
    'CA-27: purgar (`DELETE`) un nodo de `%s` borra sus accesos rápidos en cascada',
    async (table, kind) => {
      const remaining = await inRolledBackTransaction(owner, async (runner) => {
        const nodes = await seedNodes(runner);
        await insertQuickAccess(runner, nodes.userId, nodes.file);
        await insertQuickAccess(runner, nodes.userId, nodes.folder);
        const node = nodes[kind];
        await runner.query(`DELETE FROM ${table} WHERE id = $1`, [
          'fileId' in node ? node.fileId : node.folderId,
        ]);
        return countRows(runner, nodes.userId);
      });

      expect(remaining).toBe(1);
    },
  );

  it('CA-27: mover a la papelera (un `UPDATE`) conserva las marcas', async () => {
    const remaining = await inRolledBackTransaction(owner, async (runner) => {
      const { userId, folder } = await seedNodes(runner);
      await insertQuickAccess(runner, userId, folder);
      await runner.query(
        'UPDATE carpeta SET eliminado_en = now(), purgar_en = now() WHERE propietario_id = $1',
        [userId],
      );
      return countRows(runner, userId);
    });

    expect(remaining).toBe(1);
  });

  it('CA-28: borrar una cuenta con accesos rápidos a un nodo ajeno falla (`usuario_id` no es en cascada)', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const userId = await insertAccount(runner);
        const { fileId } = await insertFileWithVersion(runner, await insertAccount(runner));
        await insertQuickAccess(runner, userId, { fileId });
        await runner.query('DELETE FROM usuario WHERE id = $1', [userId]);
      }),
    ).rejects.toThrow(/acceso_rapido/);
  });
});

/** Filas de otra cuenta en las *fixtures* de `EXPLAIN`: suficientes para que las estadísticas distingan los índices. */
const OTHER_ROWS = 2000;
/** Lo que pide un listado: `maxPinned` (o `recentVisible`) + 1. */
const LIST_LIMIT = 6;

/**
 * Siembra, para `userId`, 15 fijados y 15 recientes sobre sus archivos, y `OTHER_ROWS` filas de otra cuenta; luego
 * `ANALYZE`. Todo se revierte.
 */
const seedQuickAccessVolume = async (runner: QueryRunner, userId: string): Promise<void> => {
  const other = await insertAccount(runner);
  await runner.query(
    `WITH nuevos AS (
       SELECT gen_random_uuid() AS id, d.dueno, n FROM generate_series(1, $3::int) AS n,
              (VALUES ($1::uuid, 30), ($2::uuid, $3::int)) AS d(dueno, cuantos) WHERE n <= d.cuantos),
     archivos AS (
       INSERT INTO archivo (id, propietario_id, nombre, tipo, tamano_bytes, version_actual_id, creado_en, actualizado_en)
       SELECT id, dueno, 'a' || n || '.pdf', 'pdf', 1, gen_random_uuid(), now(), now() FROM nuevos RETURNING id, propietario_id)
     INSERT INTO acceso_rapido (id, usuario_id, archivo_id, fijado_en, abierto_en, creado_en, actualizado_en)
     SELECT gen_random_uuid(), propietario_id, id,
            CASE WHEN random() < 0.5 THEN now() END, now() - random() * interval '1 day', now(), now()
       FROM archivos`,
    [userId, other, OTHER_ROWS],
  );
  await runner.query('ANALYZE archivo');
  await runner.query('ANALYZE carpeta');
  await runner.query('ANALYZE acceso_rapido');
};

/** Listado de `userId` unido a `accessibleNodes` por `tipo_nodo` y la FK que corresponda, como lo hará T-14. */
const listingSql = (actor: Actor, marks: 'fijados' | 'recientes'): string => {
  const fragment = accessibleNodes(actor);
  const nodes = fragment.sql.replaceAll(':access_actor_id', `'${actor.id}'`);
  const [filter, order] =
    marks === 'fijados'
      ? ['q.fijado_en IS NOT NULL', 'q.fijado_en']
      : ['q.fijado_en IS NULL', 'q.abierto_en'];
  return `SELECT q.id FROM acceso_rapido q
           WHERE q.usuario_id = '${actor.id}' AND ${filter}
             AND (q.archivo_id IN (SELECT n.nodo_id FROM (${nodes}) n WHERE n.tipo_nodo = 'archivo')
               OR q.carpeta_id IN (SELECT n.nodo_id FROM (${nodes}) n WHERE n.tipo_nodo = 'carpeta'))
           ORDER BY ${order} DESC, q.id DESC LIMIT ${String(LIST_LIMIT)}`;
};

describe('índices de los listados de accesos rápidos con `EXPLAIN` (R-6)', () => {
  it.each([
    ['idx_acceso_fijados', 'fijados'],
    ['idx_acceso_recientes', 'recientes'],
  ] as const)(
    'R-6: `%s` sirve al listado de %s unido a `accessibleNodes`',
    async (index, marks) => {
      const plan = await inRolledBackTransaction(owner, async (runner) => {
        const userId = await insertAccount(runner);
        await seedQuickAccessVolume(runner, userId);
        await runner.query('SET LOCAL enable_seqscan = off');
        const rows = (await runner.query(
          `EXPLAIN ${listingSql(createActor(userId, Role.CLIENT), marks)}`,
        )) as { 'QUERY PLAN': string }[];
        return rows.map((row) => row['QUERY PLAN']).join('\n');
      });

      expect(plan).toContain(index);
      expect(plan).not.toContain('Seq Scan');
    },
  );
});

describe('RLS de `acceso_rapido` (CA-28, RNF-05)', () => {
  let app: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  const internals = {} as Record<Role.ADMIN | Role.SUPPORT | Role.OPERATOR, Actor>;
  const created: string[] = [];
  let anaFile = '';

  const visibleUsers = (actor: Actor): Promise<string[]> =>
    app.asActor(actor, async (manager) =>
      ((await manager.query('SELECT usuario_id FROM acceso_rapido')) as { usuario_id: string }[])
        .map((row) => row.usuario_id)
        .filter((id) => id === ana.id || id === bruno.id),
    );

  beforeAll(async () => {
    app = await connectAsAppDatabase();
    const accounts = await owner.transaction(async (manager) => ({
      ana: await insertAccount(manager),
      bruno: await insertAccount(manager),
      admin: await insertAccount(manager, Role.ADMIN),
      support: await insertAccount(manager, Role.SUPPORT),
      operator: await insertAccount(manager, Role.OPERATOR),
    }));
    created.push(...Object.values(accounts));
    ana = createActor(accounts.ana, Role.CLIENT);
    bruno = createActor(accounts.bruno, Role.CLIENT);
    internals[Role.ADMIN] = createActor(accounts.admin, Role.ADMIN);
    internals[Role.SUPPORT] = createActor(accounts.support, Role.SUPPORT);
    internals[Role.OPERATOR] = createActor(accounts.operator, Role.OPERATOR);
    anaFile = await app.asActor(ana, async (manager) => {
      const { fileId } = await insertFileWithVersion(manager, ana.id);
      await insertQuickAccess(manager, ana.id, { fileId });
      return fileId;
    });
    await app.asActor(bruno, async (manager) => {
      const { id } = await insertFolder(manager, bruno.id);
      await insertQuickAccess(manager, bruno.id, { folderId: id });
    });
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
  });

  it('CA-28: `acceso_rapido` tiene RLS habilitada y forzada', async () => {
    const [row] = (await owner.query(
      "SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE oid = 'acceso_rapido'::regclass",
    )) as { enabled: boolean; forced: boolean }[];

    expect(row).toEqual({ enabled: true, forced: true });
  });

  it('CA-28: la única política es `acceso_rapido_cliente` (sin metadatos internos ni mantenimiento)', async () => {
    const rows = (await owner.query(
      "SELECT policyname, cmd FROM pg_policies WHERE tablename = 'acceso_rapido'",
    )) as { policyname: string; cmd: string }[];

    expect(rows).toEqual([{ policyname: 'acceso_rapido_cliente', cmd: 'ALL' }]);
  });

  it.each(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])(
    'CA-28: `nimbo_app` tiene %s sobre `acceso_rapido` por los privilegios por defecto de 003',
    async (privilege) => {
      const [row] = (await owner.query(
        "SELECT has_table_privilege('nimbo_app', 'acceso_rapido', $1) AS ok",
        [privilege],
      )) as { ok: boolean }[];

      expect(row?.ok).toBe(true);
    },
  );

  it('CA-28: un cliente solo ve sus accesos rápidos', async () => {
    await expect(visibleUsers(ana)).resolves.toEqual([ana.id]);
    await expect(visibleUsers(bruno)).resolves.toEqual([bruno.id]);
  });

  it('CA-28: un cliente no puede crear un acceso rápido a nombre de otro (WITH CHECK)', async () => {
    await expect(
      app.asActor(bruno, (manager) => insertQuickAccess(manager, ana.id, { fileId: anaFile })),
    ).rejects.toThrow(/row-level security/);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const)(
    'CA-28: %s no ve filas de `acceso_rapido`',
    async (role) => {
      await expect(visibleUsers(internals[role])).resolves.toEqual([]);
    },
  );

  it('CA-28: `nimbo_app` sin actor no ve filas de `acceso_rapido`', async () => {
    const [row] = (await app.dataSource.query('SELECT count(*)::int AS n FROM acceso_rapido')) as {
      n: number;
    }[];

    expect(row?.n).toBe(0);
  });
});

describe('cierre de la migración de accesos rápidos: `revert` ×3 y `run` ×3 sobre una base vacía (RNF-10)', () => {
  const CYCLES = 3;
  const databaseName = `nimbo_accesos_${String(process.pid)}_${String(Date.now())}`;
  let fresh: DataSource;

  /** Lo que crea la migración: columnas, índices, restricciones, políticas y RLS. */
  const schemaOf = async (): Promise<unknown> =>
    fresh.query(
      `SELECT
         (SELECT json_agg(c ORDER BY c.column_name) FROM (
            SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'acceso_rapido') c) AS columnas,
         (SELECT json_agg(i.indexdef ORDER BY i.indexname) FROM pg_indexes i
           WHERE i.tablename = 'acceso_rapido') AS indices,
         (SELECT json_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k
           WHERE k.conrelid = to_regclass('acceso_rapido')) AS restricciones,
         (SELECT json_agg(json_build_array(p.policyname, p.cmd, p.qual, p.with_check)) FROM pg_policies p
           WHERE p.tablename = 'acceso_rapido') AS politicas,
         (SELECT json_build_array(r.relrowsecurity, r.relforcerowsecurity) FROM pg_class r
           WHERE r.oid = to_regclass('acceso_rapido')) AS rls`,
    );

  const appliedNames = async (): Promise<string[]> =>
    ((await fresh.query('SELECT name FROM migracion ORDER BY id')) as { name: string }[]).map(
      (row) => row.name,
    );

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
    const before = await schemaOf();

    expect(applied.at(-1)).toBe(QUICK_ACCESS_MIGRATION);
    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      await fresh.undoLastMigration({ transaction: 'each' });
      const [gone] = (await fresh.query("SELECT to_regclass('acceso_rapido')::text AS tabla")) as {
        tabla: string | null;
      }[];

      expect(await appliedNames()).toEqual(applied.slice(0, -1));
      expect(gone?.tabla).toBeNull();

      const rerun = await fresh.runMigrations({ transaction: 'each' });

      expect(rerun.map((migration) => migration.name)).toEqual([QUICK_ACCESS_MIGRATION]);
      expect(await schemaOf()).toEqual(before);
    }
  });
});
