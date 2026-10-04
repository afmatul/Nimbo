import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';

import type { Actor } from '../../../src/shared';
import { buildDataSourceOptions, createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';

import type { AppDatabase, Queryable } from './storage-test-db';
import {
  columnsOf,
  connectAsAppDatabase,
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  insertFolder,
  removeAccounts,
} from './storage-test-db';

/**
 * Migraciones de 006 (plan §3) sobre el Postgres del arnés, como el dueño de las tablas. Los casos de esquema corren en
 * una transacción que se revierte; los de RLS confirman *fixtures* como `nimbo_app` dentro de `withActor` y las borran
 * al final. En el arnés el dueño es superusuario: las políticas `*_mantenimiento` con un dueño `NOSUPERUSER` las prueba
 * `test/isolation/storage-maintenance.iso-spec.ts` (T-07).
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const FUNCTION_SIGNATURE = 'papelera_vencida(timestamptz, integer)';
/** Tope fijo de `papelera_vencida` (ADR-0021). */
const FUNCTION_CAP = 1000;
const FOLDER_MIGRATIONS = [
  'CrearCarpeta20261001100000',
  'CarpetaYPapeleraEnArchivoYCarga20261001100100',
  'RlsCarpetaYPurgaDePapelera20261001100200',
];

let owner: DataSource;

beforeAll(async () => {
  owner = await connectAsOwner();
});

afterAll(async () => {
  await owner.destroy();
});

describe('migración crear-carpeta (CA-1, CA-3, CA-9, CA-11)', () => {
  it('CA-1: `carpeta` tiene las columnas del plan, con `ruta` en `text` y `profundidad` en `smallint`', async () => {
    const columns = await inRolledBackTransaction(owner, (runner) => columnsOf(runner, 'carpeta'));

    expect(Object.keys(columns).sort()).toEqual([
      'actualizado_en',
      'carpeta_padre_id',
      'creado_en',
      'eliminado_con_carpeta_id',
      'eliminado_en',
      'id',
      'nombre',
      'profundidad',
      'propietario_id',
      'purgar_en',
      'ruta',
    ]);
    expect(columns['ruta']).toEqual({ type: 'text', nullable: false, default: null });
    expect(columns['profundidad']).toEqual({ type: 'smallint', nullable: false, default: null });
    expect(columns['carpeta_padre_id']?.nullable).toBe(true);
    expect(columns['purgar_en']).toEqual({
      type: 'timestamp with time zone',
      nullable: true,
      default: null,
    });
  });

  it.each([
    ['en la raíz (la raíz cuenta como un padre más)', false],
    ['dentro de una carpeta', true],
  ])(
    'CA-3: «Ñandú» y «ñandú» no conviven entre carpetas hermanas vivas %s',
    async (_where, nested) => {
      await expect(
        inRolledBackTransaction(owner, async (runner) => {
          const ana = await insertAccount(runner);
          const parent = nested ? await insertFolder(runner, ana) : null;
          await insertFolder(runner, ana, { name: 'Ñandú', parent });
          await insertFolder(runner, ana, { name: 'ñandú', parent });
        }),
      ).rejects.toThrow(/uq_carpeta_hermanos_nombre/);
    },
  );

  it('CA-3: el nombre se repite en otra carpeta, en la papelera, en otra cuenta y entre un archivo y una carpeta', async () => {
    const inserted = await inRolledBackTransaction(owner, async (runner) => {
      const ana = await insertAccount(runner);
      const bruno = await insertAccount(runner);
      const parent = await insertFolder(runner, ana, { name: 'Ñandú' });
      await insertFolder(runner, ana, { name: 'ñandú', parent });
      await insertFolder(runner, ana, { name: 'ÑANDÚ', deletedAt: new Date() });
      await insertFolder(runner, bruno, { name: 'Ñandú' });
      await insertFileWithVersion(runner, ana, { name: 'Ñandú' });
      return 5;
    });

    expect(inserted).toBe(5);
  });

  it.each([
    ['ck_carpeta_padre', 'UPDATE carpeta SET carpeta_padre_id = id'],
    ['ck_carpeta_papelera', 'UPDATE carpeta SET eliminado_en = now()'],
    ['ck_carpeta_papelera', 'UPDATE carpeta SET purgar_en = now()'],
    ['ck_carpeta_papelera', 'UPDATE carpeta SET eliminado_con_carpeta_id = id'],
    ['carpeta_profundidad_check', 'UPDATE carpeta SET profundidad = 0'],
  ])('CA-9, CA-11: `%s` rechaza `%s`', async (constraint, statement) => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        await insertFolder(runner, await insertAccount(runner));
        await runner.query(statement);
      }),
    ).rejects.toThrow(new RegExp(constraint));
  });

  it('CA-11: una carpeta en la papelera puede señalar la carpeta que la arrastró', async () => {
    const dragged = await inRolledBackTransaction(owner, async (runner) => {
      const ana = await insertAccount(runner);
      const deletedAt = new Date();
      const root = await insertFolder(runner, ana, { deletedAt });
      await insertFolder(runner, ana, { parent: root, deletedAt, trashedWithFolderId: root.id });
      const [row] = (await runner.query(
        'SELECT count(*)::int AS n FROM carpeta WHERE eliminado_con_carpeta_id = $1',
        [root.id],
      )) as { n: number }[];
      return row?.n;
    });

    expect(dragged).toBe(1);
  });
});

describe('migración carpeta-y-papelera-en-archivo-y-carga (CA-3, CA-6, CA-11, CA-19)', () => {
  it('CA-11, CA-19: `archivo` agrega carpeta y papelera, y `carga` su carpeta destino, todas opcionales', async () => {
    const [file, upload] = await inRolledBackTransaction(owner, async (runner) => [
      await columnsOf(runner, 'archivo'),
      await columnsOf(runner, 'carga'),
    ]);

    expect(file['carpeta_id']).toEqual({ type: 'uuid', nullable: true, default: null });
    expect(file['eliminado_con_carpeta_id']).toEqual({
      type: 'uuid',
      nullable: true,
      default: null,
    });
    expect(file['purgar_en']).toEqual({
      type: 'timestamp with time zone',
      nullable: true,
      default: null,
    });
    expect(upload['carpeta_destino_id']).toEqual({ type: 'uuid', nullable: true, default: null });
  });

  it('CA-6: `carga.carpeta_destino_id` no tiene FK (se valida al iniciar y al completar)', async () => {
    const [row] = (await owner.query(
      `SELECT count(*)::int AS n FROM pg_constraint
        WHERE conrelid = 'carga'::regclass AND contype = 'f'
          AND conkey @> ARRAY[(SELECT attnum FROM pg_attribute
                                WHERE attrelid = 'carga'::regclass AND attname = 'carpeta_destino_id')]`,
    )) as { n: number }[];

    expect(row?.n).toBe(0);
  });

  it.each([
    ['en la raíz', false],
    ['dentro de una carpeta', true],
  ])(
    'CA-3: «Ñandú.pdf» y «ñandú.PDF» no conviven entre archivos hermanos vivos %s',
    async (_where, nested) => {
      await expect(
        inRolledBackTransaction(owner, async (runner) => {
          const ana = await insertAccount(runner);
          const folderId = nested ? (await insertFolder(runner, ana)).id : null;
          await insertFileWithVersion(runner, ana, { name: 'Ñandú.pdf', folderId });
          await insertFileWithVersion(runner, ana, { name: 'ñandú.PDF', folderId });
        }),
      ).rejects.toThrow(/uq_archivo_hermanos_nombre/);
    },
  );

  it('CA-6: el mismo nombre de archivo vale en carpetas distintas', async () => {
    const inserted = await inRolledBackTransaction(owner, async (runner) => {
      const ana = await insertAccount(runner);
      const folder = await insertFolder(runner, ana);
      await insertFileWithVersion(runner, ana, { name: 'plan.pdf' });
      await insertFileWithVersion(runner, ana, { name: 'plan.pdf', folderId: folder.id });
      return 2;
    });

    expect(inserted).toBe(2);
  });

  it.each([
    'UPDATE archivo SET eliminado_en = now()',
    'UPDATE archivo SET purgar_en = now()',
    'UPDATE archivo SET eliminado_con_carpeta_id = carpeta_id',
  ])('CA-19: `ck_archivo_papelera` rechaza `%s`', async (statement) => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const ana = await insertAccount(runner);
        const folder = await insertFolder(runner, ana);
        await insertFileWithVersion(runner, ana, { folderId: folder.id });
        await runner.query(statement);
      }),
    ).rejects.toThrow(/ck_archivo_papelera/);
  });

  it('CA-3: los índices de nombre y listado de 005 se reemplazan por los de carpeta', async () => {
    const rows = (await owner.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'archivo' ORDER BY indexname",
    )) as { indexname: string }[];
    const names = rows.map((row) => row.indexname);

    expect(names).toEqual(
      expect.arrayContaining([
        'idx_archivo_arrastrado',
        'idx_archivo_carpeta_creado',
        'idx_archivo_papelera',
        'idx_archivo_purga',
        'idx_archivo_raiz_creado',
        'uq_archivo_hermanos_nombre',
      ]),
    );
    expect(names).not.toContain('uq_archivo_propietario_nombre');
    expect(names).not.toContain('idx_archivo_propietario_creado');
  });
});

/** Filas por grupo de las *fixtures* de `EXPLAIN`: suficientes para que las estadísticas distingan los índices. */
const ROWS_PER_GROUP = 500;

/**
 * Siembra, para `ownerId`, una carpeta `folderId` con hijas y archivos, otro tanto en la raíz, raíces en la papelera y
 * archivos arrastrados por `folderId`, más el mismo volumen de otra cuenta; luego `ANALYZE`. Todo se revierte.
 */
const seedVolume = async (
  runner: QueryRunner,
  ownerId: string,
  folderId: string,
): Promise<void> => {
  const other = await insertAccount(runner);
  await runner.query(
    `INSERT INTO carpeta (id, propietario_id, nombre, ruta, profundidad, creado_en, actualizado_en)
     VALUES ($1::uuid, $2, 'raíz de prueba', '/' || $1::text || '/', 1, now(), now())`,
    [folderId, ownerId],
  );
  await runner.query(
    `INSERT INTO carpeta (id, propietario_id, carpeta_padre_id, nombre, ruta, profundidad, creado_en, actualizado_en,
                          eliminado_en, purgar_en)
     SELECT g.id, g.dueno, g.padre, 'c' || g.n, coalesce('/' || g.padre || '/', '/') || g.id || '/',
            CASE WHEN g.padre IS NULL THEN 1 ELSE 2 END, now(), now(), g.borrado, g.borrado
       FROM (SELECT gen_random_uuid() AS id, n, d.dueno, d.padre, d.borrado
               FROM generate_series(1, $3::int) AS n,
                    (VALUES ($1::uuid, $2::uuid, NULL::timestamptz), ($1::uuid, NULL::uuid, NULL::timestamptz),
                            ($1::uuid, NULL::uuid, now()), ($4::uuid, NULL::uuid, NULL::timestamptz))
                      AS d(dueno, padre, borrado)) g`,
    [ownerId, folderId, ROWS_PER_GROUP, other],
  );
  await runner.query(
    `INSERT INTO archivo (id, propietario_id, carpeta_id, nombre, tipo, tamano_bytes, version_actual_id, creado_en,
                          actualizado_en, eliminado_en, purgar_en, eliminado_con_carpeta_id)
     SELECT gen_random_uuid(), d.dueno, d.carpeta, 'a' || n || '.pdf', 'pdf', 1, gen_random_uuid(), now(), now(),
            d.borrado, d.borrado, d.arrastre
       FROM generate_series(1, $3::int) AS n,
            (VALUES ($1::uuid, $2::uuid, NULL::timestamptz, NULL::uuid), ($1::uuid, NULL::uuid, NULL::timestamptz, NULL::uuid),
                    ($1::uuid, NULL::uuid, now(), NULL::uuid), ($1::uuid, NULL::uuid, now(), $2::uuid),
                    ($4::uuid, NULL::uuid, NULL::timestamptz, NULL::uuid))
              AS d(dueno, carpeta, borrado, arrastre)`,
    [ownerId, folderId, ROWS_PER_GROUP, other],
  );
  await runner.query('ANALYZE carpeta');
  await runner.query('ANALYZE archivo');
};

/** Plan de `sql` sin barridos secuenciales, para comprobar qué índice sirve a cada consulta. */
const planOf = async (runner: QueryRunner, sql: string): Promise<string> => {
  await runner.query('SET LOCAL enable_seqscan = off');
  const rows = (await runner.query(`EXPLAIN ${sql}`)) as { 'QUERY PLAN': string }[];
  return rows.map((row) => row['QUERY PLAN']).join('\n');
};

describe('índices de carpetas y papelera con `EXPLAIN` (CA-3, R-2)', () => {
  const folderId = randomUUID();
  const OWNER = ':owner';

  it.each([
    [
      'idx_carpeta_hijas',
      `SELECT id FROM carpeta WHERE propietario_id = ${OWNER} AND carpeta_padre_id = '${folderId}'
         AND eliminado_en IS NULL ORDER BY creado_en DESC, id DESC LIMIT 50`,
    ],
    [
      'idx_carpeta_raiz_creado',
      `SELECT id FROM carpeta WHERE propietario_id = ${OWNER} AND carpeta_padre_id IS NULL
         AND eliminado_en IS NULL ORDER BY creado_en DESC, id DESC LIMIT 50`,
    ],
    [
      'idx_archivo_raiz_creado',
      `SELECT id FROM archivo WHERE propietario_id = ${OWNER} AND carpeta_id IS NULL
         AND eliminado_en IS NULL ORDER BY creado_en DESC, id DESC LIMIT 50`,
    ],
    [
      'idx_archivo_carpeta_creado',
      `SELECT id FROM archivo WHERE propietario_id = ${OWNER} AND carpeta_id = '${folderId}'
         AND eliminado_en IS NULL ORDER BY creado_en DESC, id DESC LIMIT 50`,
    ],
    [
      'idx_carpeta_ruta',
      `SELECT id FROM carpeta WHERE propietario_id = ${OWNER} AND ruta LIKE '/${folderId}/%'`,
    ],
    [
      'idx_carpeta_papelera',
      `SELECT id FROM carpeta WHERE propietario_id = ${OWNER} AND eliminado_en IS NOT NULL
         AND eliminado_con_carpeta_id IS NULL ORDER BY eliminado_en DESC, id DESC LIMIT 50`,
    ],
    [
      'idx_archivo_papelera',
      `SELECT id FROM archivo WHERE propietario_id = ${OWNER} AND eliminado_en IS NOT NULL
         AND eliminado_con_carpeta_id IS NULL ORDER BY eliminado_en DESC, id DESC LIMIT 50`,
    ],
    [
      'idx_archivo_arrastrado',
      `SELECT id FROM archivo WHERE eliminado_con_carpeta_id = '${folderId}'`,
    ],
    [
      'idx_carpeta_purga',
      `SELECT id FROM carpeta WHERE eliminado_en IS NOT NULL AND eliminado_con_carpeta_id IS NULL
         AND purgar_en <= now() ORDER BY purgar_en LIMIT 100`,
    ],
    [
      'idx_archivo_purga',
      `SELECT id FROM archivo WHERE eliminado_en IS NOT NULL AND eliminado_con_carpeta_id IS NULL
         AND purgar_en <= now() ORDER BY purgar_en LIMIT 100`,
    ],
  ])('R-2: la consulta usa `%s`', async (index, sql) => {
    const plan = await inRolledBackTransaction(owner, async (runner) => {
      const ownerId = await insertAccount(runner);
      await seedVolume(runner, ownerId, folderId);
      return planOf(runner, sql.replace(OWNER, `'${ownerId}'`));
    });

    expect(plan).toContain(index);
    expect(plan).not.toContain('Seq Scan');
  });
});

describe('migración rls-carpeta-y-purga-de-papelera (CA-19, CA-22, DF-52)', () => {
  const HOUR_MS = 60 * 60 * 1000;
  let app: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  const internals = {} as Record<Role.ADMIN | Role.SUPPORT | Role.OPERATOR, Actor>;
  const created: string[] = [];
  const nodes = {
    expiredFolder: '',
    expiredFile: '',
    draggedFolder: '',
    draggedFile: '',
    pendingFile: '',
    liveFolder: '',
  };

  const visibleOwners = (actor: Actor): Promise<string[]> =>
    app.asActor(actor, async (manager) =>
      ((await manager.query('SELECT propietario_id FROM carpeta')) as { propietario_id: string }[])
        .map((row) => row.propietario_id)
        .filter((id) => id === ana.id || id === bruno.id),
    );

  const insertExpiredTree = async (manager: Queryable, ownerId: string): Promise<void> => {
    const deletedAt = new Date(Date.now() - 2 * DAY_MS);
    const purgeAt = new Date(Date.now() - HOUR_MS);
    const root = await insertFolder(manager, ownerId, { deletedAt, purgeAt });
    const child = await insertFolder(manager, ownerId, {
      parent: root,
      deletedAt,
      purgeAt,
      trashedWithFolderId: root.id,
    });
    const dragged = await insertFileWithVersion(manager, ownerId, {
      folderId: child.id,
      deletedAt,
      purgeAt,
      trashedWithFolderId: root.id,
    });
    const expired = await insertFileWithVersion(manager, ownerId, { deletedAt, purgeAt });
    const pending = await insertFileWithVersion(manager, ownerId, {
      deletedAt,
      purgeAt: new Date(Date.now() + DAY_MS),
    });
    Object.assign(nodes, {
      expiredFolder: root.id,
      draggedFolder: child.id,
      draggedFile: dragged.fileId,
      expiredFile: expired.fileId,
      pendingFile: pending.fileId,
      liveFolder: (await insertFolder(manager, ownerId)).id,
    });
  };

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
    await app.asActor(ana, (manager) => insertExpiredTree(manager, ana.id));
    await app.asActor(bruno, (manager) => insertFolder(manager, bruno.id));
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
  });

  it('CA-22: `carpeta` tiene RLS habilitada y forzada', async () => {
    const [row] = (await owner.query(
      "SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE oid = 'carpeta'::regclass",
    )) as { enabled: boolean; forced: boolean }[];

    expect(row).toEqual({ enabled: true, forced: true });
  });

  it.each(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])(
    'CA-22: `nimbo_app` tiene %s sobre `carpeta` por los privilegios por defecto de 003',
    async (privilege) => {
      const [row] = (await owner.query(
        "SELECT has_table_privilege('nimbo_app', 'carpeta', $1) AS ok",
        [privilege],
      )) as { ok: boolean }[];

      expect(row?.ok).toBe(true);
    },
  );

  it('CA-22: un cliente solo ve sus carpetas', async () => {
    const owners = await visibleOwners(ana);

    expect(owners.length).toBeGreaterThan(0);
    expect(owners).not.toContain(bruno.id);
  });

  it('CA-22: un cliente no puede crear una carpeta a nombre de otro (WITH CHECK)', async () => {
    await expect(app.asActor(bruno, (manager) => insertFolder(manager, ana.id))).rejects.toThrow(
      /row-level security/,
    );
  });

  it.each([Role.ADMIN, Role.SUPPORT] as const)(
    'CA-22: %s lee metadatos de `carpeta` pero no puede modificarla',
    async (role) => {
      const actor = internals[role];

      await expect(visibleOwners(actor)).resolves.toEqual(
        expect.arrayContaining([ana.id, bruno.id]),
      );
      await expect(
        app.asActor(actor, (manager) =>
          manager.query(
            'UPDATE carpeta SET nombre = nombre WHERE propietario_id = $1 RETURNING id',
            [ana.id],
          ),
        ),
      ).resolves.toEqual([[], 0]);
    },
  );

  it('CA-22: OPERATOR no ve filas de `carpeta`', async () => {
    await expect(visibleOwners(internals[Role.OPERATOR])).resolves.toEqual([]);
  });

  it('CA-22: `nimbo_app` sin actor no ve filas de `carpeta`', async () => {
    const [row] = (await app.dataSource.query('SELECT count(*)::int AS n FROM carpeta')) as {
      n: number;
    }[];

    expect(row?.n).toBe(0);
  });

  it('CA-19: `papelera_vencida` devuelve solo `(tipo_nodo, id, propietario_id)` de las raíces vencidas, sin actor', async () => {
    const rows = (await app.dataSource.query('SELECT * FROM papelera_vencida($1, $2)', [
      new Date(),
      FUNCTION_CAP,
    ])) as Record<string, string>[];
    const mine = rows.filter((row) => row['propietario_id'] === ana.id);

    expect(mine).toEqual(
      expect.arrayContaining([
        { tipo_nodo: 'carpeta', id: nodes.expiredFolder, propietario_id: ana.id },
        { tipo_nodo: 'archivo', id: nodes.expiredFile, propietario_id: ana.id },
      ]),
    );
    expect(mine).toHaveLength(2);
  });

  it('CA-19: un `p_ahora` futuro no revela lo que aún no vence (`LEAST(p_ahora, now())`)', async () => {
    const rows = (await app.dataSource.query('SELECT id FROM papelera_vencida($1, $2)', [
      new Date(Date.now() + 365 * DAY_MS),
      FUNCTION_CAP,
    ])) as { id: string }[];
    const ids = rows.map((row) => row.id);

    expect(ids).not.toContain(nodes.pendingFile);
    expect(ids).not.toContain(nodes.liveFolder);
    expect(ids).not.toContain(nodes.draggedFolder);
    expect(ids).not.toContain(nodes.draggedFile);
  });

  it.each([0, -5])('DF-52: con `p_limite = %i` no devuelve filas', async (limit) => {
    const rows = (await app.dataSource.query('SELECT id FROM papelera_vencida($1, $2)', [
      new Date(),
      limit,
    ])) as unknown[];

    expect(rows).toEqual([]);
  });

  it('DF-52: devuelve como máximo 1000 filas aunque se pidan más', async () => {
    const count = await inRolledBackTransaction(owner, async (runner) => {
      const ownerId = await insertAccount(runner);
      await runner.query(
        `INSERT INTO carpeta (id, propietario_id, nombre, ruta, profundidad, creado_en, actualizado_en, eliminado_en,
                              purgar_en)
         SELECT g.id, $1, 'c' || g.n, '/' || g.id || '/', 1, now(), now(), now() - interval '2 days',
                now() - interval '1 hour'
           FROM (SELECT gen_random_uuid() AS id, n FROM generate_series(1, $2::int + 1) AS n) g`,
        [ownerId, FUNCTION_CAP],
      );
      const [row] = (await runner.query(
        'SELECT count(*)::int AS n FROM papelera_vencida(now(), 5000)',
      )) as { n: number }[];
      return row?.n;
    });

    expect(count).toBe(FUNCTION_CAP);
  });

  it('DF-52: `papelera_vencida` es SECURITY DEFINER con `search_path` fijo y solo la ejecuta `nimbo_app`', async () => {
    const [row] = (await owner.query(
      `SELECT p.prosecdef AS definer, p.proconfig AS config,
              has_function_privilege('nimbo_app', p.oid, 'EXECUTE') AS app,
              has_function_privilege('public', p.oid, 'EXECUTE') AS public
         FROM pg_proc p WHERE p.oid = $1::regprocedure`,
      [FUNCTION_SIGNATURE],
    )) as { definer: boolean; config: string[]; app: boolean; public: boolean }[];

    expect(row).toEqual({
      definer: true,
      config: ['search_path=pg_catalog, pg_temp'],
      app: true,
      public: false,
    });
  });

  it('DF-52: las políticas de mantenimiento son de solo lectura y solo dejan ver la papelera', async () => {
    const rows = (await owner.query(
      `SELECT tablename, cmd, qual FROM pg_policies
        WHERE policyname IN ('archivo_mantenimiento', 'carpeta_mantenimiento') ORDER BY tablename`,
    )) as { tablename: string; cmd: string; qual: string }[];

    expect(rows).toEqual([
      { tablename: 'archivo', cmd: 'SELECT', qual: '(eliminado_en IS NOT NULL)' },
      { tablename: 'carpeta', cmd: 'SELECT', qual: '(eliminado_en IS NOT NULL)' },
    ]);
  });
});

describe('cierre de las migraciones de 006: `revert` ×3 y `run` ×3 sobre una base vacía (RNF-10)', () => {
  const CYCLES = 3;
  const databaseName = `nimbo_carpetas_${String(process.pid)}_${String(Date.now())}`;
  let fresh: DataSource;

  /** Lo que tocan las tres migraciones: columnas, índices, restricciones, políticas, RLS y la función. */
  const schemaOf = async (dataSource: DataSource): Promise<unknown> =>
    dataSource.query(
      `SELECT
         (SELECT json_agg(c ORDER BY c.table_name, c.column_name) FROM (
            SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name IN ('carpeta', 'archivo', 'carga')) c) AS columnas,
         (SELECT json_agg(i.indexdef ORDER BY i.indexname) FROM pg_indexes i
           WHERE i.tablename IN ('carpeta', 'archivo', 'carga')) AS indices,
         (SELECT json_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k
           WHERE k.conrelid IN (to_regclass('carpeta'), 'archivo'::regclass, 'carga'::regclass)) AS restricciones,
         (SELECT json_agg(json_build_array(p.tablename, p.policyname, p.cmd, p.qual) ORDER BY p.policyname)
            FROM pg_policies p WHERE p.tablename IN ('carpeta', 'archivo')) AS politicas,
         (SELECT json_agg(json_build_array(r.relname, r.relrowsecurity, r.relforcerowsecurity) ORDER BY r.relname)
            FROM pg_class r WHERE r.relname IN ('carpeta', 'archivo', 'carga') AND r.relkind = 'r') AS rls,
         to_regprocedure('${FUNCTION_SIGNATURE}')::text AS funcion`,
    );

  /** Lo que deja el `down` de las tres: el esquema de 005 tal cual. */
  const stateAfterRevert = async (): Promise<unknown> => {
    const [row] = (await fresh.query(
      `SELECT to_regclass('carpeta')::text AS carpeta,
              to_regprocedure('${FUNCTION_SIGNATURE}')::text AS funcion,
              (SELECT count(*)::int FROM information_schema.columns
                WHERE (table_name = 'archivo' AND column_name IN ('carpeta_id', 'purgar_en', 'eliminado_con_carpeta_id'))
                   OR (table_name = 'carga' AND column_name = 'carpeta_destino_id')) AS columnas,
              (SELECT array_agg(indexname::text ORDER BY indexname) FROM pg_indexes
                WHERE tablename = 'archivo' AND indexname LIKE ANY (ARRAY['uq_%', 'idx_archivo_%'])) AS indices,
              (SELECT count(*)::int FROM pg_policies WHERE policyname = 'archivo_mantenimiento') AS politicas`,
    )) as Record<string, unknown>[];
    return row;
  };

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

  /** Las tres de carpetas y las que vinieron después (accesos rápidos…): para revertirlas hay que revertir antes las posteriores. */
  const fromFolders = (applied: readonly string[]): string[] =>
    applied.slice(applied.indexOf(FOLDER_MIGRATIONS[0] ?? ''));

  it('RNF-10: las tres migraciones de 006 (y las posteriores) se revierten y vuelven a correr tres veces con el mismo esquema', async () => {
    await fresh.runMigrations({ transaction: 'each' });
    const applied = await appliedNames();
    const reverted = fromFolders(applied);
    const before = await schemaOf(fresh);

    expect(reverted.slice(0, FOLDER_MIGRATIONS.length)).toEqual(FOLDER_MIGRATIONS);
    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      for (const _ of reverted) {
        await fresh.undoLastMigration({ transaction: 'each' });
      }
      expect(await appliedNames()).toEqual(applied.slice(0, -reverted.length));
      expect(await stateAfterRevert()).toEqual({
        carpeta: null,
        funcion: null,
        columnas: 0,
        indices: ['idx_archivo_propietario_creado', 'uq_archivo_propietario_nombre'],
        politicas: 0,
      });

      const rerun = await fresh.runMigrations({ transaction: 'each' });

      expect(rerun.map((migration) => migration.name)).toEqual(reverted);
      expect(await schemaOf(fresh)).toEqual(before);
    }
  });
});
