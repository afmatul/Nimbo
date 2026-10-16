import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';

import { AgregarEspacioUsadoAUsuario20260930100000 } from '../../../src/migrations/20260930100000-agregar-espacio-usado-a-usuario';
import { CrearArchivoYVersionArchivo20260930100100 } from '../../../src/migrations/20260930100100-crear-archivo-y-version-archivo';
import { CrearCarga20260930100200 } from '../../../src/migrations/20260930100200-crear-carga';
import { PoliticasRlsArchivoVersionCarga20260930100300 } from '../../../src/migrations/20260930100300-politicas-rls-archivo-version-carga';
import { CrearAccesoRapido20261003100000 } from '../../../src/migrations/20261003100000-crear-acceso-rapido';
import type { Actor } from '../../../src/shared';
import { buildDataSourceOptions, createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';

import type { AppDatabase } from './storage-test-db';
import {
  columnsOf,
  connectAsAppDatabase,
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  insertUpload,
  removeAccounts,
} from './storage-test-db';

/**
 * Migraciones de 005 (plan §4) sobre el Postgres del arnés, como el dueño de las tablas. Cada caso corre en una
 * transacción que se revierte: el esquema compartido no cambia.
 */
let owner: DataSource;

beforeAll(async () => {
  owner = await connectAsOwner();
});

afterAll(async () => {
  await owner.destroy();
});

describe('migración agregar-espacio-usado-a-usuario (CA-4, RN-10)', () => {
  it('CA-4: `usuario.espacio_usado` es `bigint NOT NULL DEFAULT 0` y una cuenta nueva empieza en 0', async () => {
    const [column, used] = await inRolledBackTransaction(owner, async (runner) => {
      const id = await insertAccount(runner);
      const [row] = (await runner.query('SELECT espacio_usado FROM usuario WHERE id = $1', [
        id,
      ])) as {
        espacio_usado: string;
      }[];
      return [(await columnsOf(runner, 'usuario'))['espacio_usado'], row?.espacio_usado];
    });

    expect(column).toEqual({ type: 'bigint', nullable: false, default: '0' });
    expect(used).toBe('0');
  });

  it('RN-10: `ck_usuario_espacio_usado` rechaza un espacio usado negativo', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const id = await insertAccount(runner);
        await runner.query('UPDATE usuario SET espacio_usado = -1 WHERE id = $1', [id]);
      }),
    ).rejects.toThrow(/ck_usuario_espacio_usado/);
  });

  it('RN-10: el `down` quita la restricción y la columna, y el `up` las devuelve', async () => {
    const migration = new AgregarEspacioUsadoAUsuario20260930100000();

    const [afterDown, afterUp] = await inRolledBackTransaction(owner, async (runner) => {
      await migration.down(runner);
      const down = await columnsOf(runner, 'usuario');
      await migration.up(runner);
      return [down, await columnsOf(runner, 'usuario')];
    });

    expect(afterDown).not.toHaveProperty('espacio_usado');
    expect(afterUp).toHaveProperty('espacio_usado');
  });
});

describe('migración crear-archivo-y-version-archivo (CA-1, CA-6)', () => {
  it('CA-1: `archivo` y `version_archivo` tienen las columnas del plan, bytes en `bigint` y sin columnas de más', async () => {
    const [file, version] = await inRolledBackTransaction(owner, async (runner) => [
      await columnsOf(runner, 'archivo'),
      await columnsOf(runner, 'version_archivo'),
    ]);

    // 006 agrega `carpeta_id`, `purgar_en` y `eliminado_con_carpeta_id` (folders-migrations.int-spec.ts); 014,
    // `numero` y `restaurada_de_numero` (versions-migrations.int-spec.ts).
    expect(Object.keys(file).sort()).toEqual([
      'actualizado_en',
      'carpeta_id',
      'creado_en',
      'eliminado_con_carpeta_id',
      'eliminado_en',
      'id',
      'nombre',
      'propietario_id',
      'purgar_en',
      'tamano_bytes',
      'tipo',
      'version_actual_id',
    ]);
    expect(Object.keys(version).sort()).toEqual([
      'archivo_id',
      'clave_objeto',
      'creada_en',
      'creado_por',
      'id',
      'numero',
      'origen',
      'restaurada_de_numero',
      'tamano_bytes',
    ]);
    expect(file['tamano_bytes']?.type).toBe('bigint');
    expect(version['tamano_bytes']?.type).toBe('bigint');
  });

  it('CA-1: la FK `version_actual_id` es diferida: `archivo` se inserta antes que su versión', async () => {
    const ids = await inRolledBackTransaction(owner, async (runner) =>
      insertFileWithVersion(runner, await insertAccount(runner)),
    );

    expect(ids.fileId).toEqual(expect.any(String));
  });

  it('CA-1: sin su versión, `archivo` no pasa la comprobación diferida', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const ownerId = await insertAccount(runner);
        await runner.query(
          `INSERT INTO archivo (id, propietario_id, nombre, tipo, tamano_bytes, version_actual_id, creado_en,
                                actualizado_en)
           VALUES (gen_random_uuid(), $1, 'huerfano.pdf', 'pdf', 1, gen_random_uuid(), now(), now())`,
          [ownerId],
        );
        await runner.query('SET CONSTRAINTS fk_archivo_version_actual IMMEDIATE');
      }),
    ).rejects.toThrow(/fk_archivo_version_actual/);
  });

  it('CA-6: el mismo nombre sin distinguir mayúsculas se rechaza en la raíz (`uq_archivo_hermanos_nombre` desde 006)', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const ownerId = await insertAccount(runner);
        await insertFileWithVersion(runner, ownerId, { name: 'Ñandú.pdf' });
        await insertFileWithVersion(runner, ownerId, { name: 'ñandú.PDF' });
      }),
    ).rejects.toThrow(/uq_archivo_hermanos_nombre/);
  });

  it('CA-6: el nombre se repite si el otro está en la papelera o es de otro propietario', async () => {
    const inserted = await inRolledBackTransaction(owner, async (runner) => {
      const ana = await insertAccount(runner);
      const bruno = await insertAccount(runner);
      await insertFileWithVersion(runner, ana, { name: 'plan.pdf', deletedAt: new Date() });
      await insertFileWithVersion(runner, ana, { name: 'plan.pdf' });
      await insertFileWithVersion(runner, bruno, { name: 'plan.pdf' });
      return 3;
    });

    expect(inserted).toBe(3);
  });

  it.each([
    ['archivo', 'UPDATE archivo SET tamano_bytes = 0'],
    ['version_archivo', 'UPDATE version_archivo SET tamano_bytes = 0'],
    ['archivo', "UPDATE archivo SET tipo = 'exe'"],
    ['version_archivo', "UPDATE version_archivo SET origen = 'copia'"],
  ])('CA-1: los CHECK de `%s` rechazan `%s`', async (_table, statement) => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        await insertFileWithVersion(runner, await insertAccount(runner));
        await runner.query(statement);
      }),
    ).rejects.toThrow(/violates check constraint/);
  });

  it('CA-1: `clave_objeto` es única', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const first = await insertFileWithVersion(runner, await insertAccount(runner));
        const second = await insertFileWithVersion(runner, await insertAccount(runner));
        await runner.query(
          `UPDATE version_archivo SET clave_objeto = (SELECT clave_objeto FROM version_archivo WHERE id = $1)
            WHERE id = $2`,
          [first.versionId, second.versionId],
        );
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it('CA-1: el `down` borra ambas tablas y el `up` las recrea con sus índices', async () => {
    const migration = new CrearArchivoYVersionArchivo20260930100100();

    const [afterDown, indexes] = await inRolledBackTransaction(owner, async (runner) => {
      /** `acceso_rapido` (006 §9.2) referencia `archivo`: se revierte antes, como en un `migration:revert` en orden. */
      await new CrearAccesoRapido20261003100000().down(runner);
      await migration.down(runner);
      const [tables] = (await runner.query(
        "SELECT to_regclass('archivo')::text AS archivo, to_regclass('version_archivo')::text AS version",
      )) as { archivo: string | null; version: string | null }[];
      await migration.up(runner);
      const rows = (await runner.query(
        "SELECT indexname FROM pg_indexes WHERE tablename IN ('archivo', 'version_archivo') ORDER BY indexname",
      )) as { indexname: string }[];
      return [tables, rows.map((row) => row.indexname)] as const;
    });

    expect(afterDown).toEqual({ archivo: null, version: null });
    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_archivo_propietario_creado',
        'idx_version_archivo_archivo',
        'uq_archivo_propietario_nombre',
      ]),
    );
  });
});

describe('migración crear-carga (CA-2, CA-9, CA-23)', () => {
  it('CA-2: `carga` tiene las columnas del plan y los bytes en `bigint`', async () => {
    const columns = await inRolledBackTransaction(owner, (runner) => columnsOf(runner, 'carga'));

    // 006 agrega `carpeta_destino_id` (folders-migrations.int-spec.ts); 014, `reemplaza` (versions-migrations.int-spec.ts).
    expect(Object.keys(columns).sort()).toEqual([
      'actualizada_en',
      'archivo_id',
      'carpeta_destino_id',
      'clave_objeto',
      'conservar_ambos',
      'creada_en',
      'estado',
      'expira_en',
      'finalizada_en',
      'id',
      'modo',
      'motivo_rechazo',
      'nombre',
      'partes_totales',
      'propietario_id',
      'reemplaza',
      'tamano_bytes',
      'tamano_parte_bytes',
      'upload_id',
      'version_id',
    ]);
    expect(columns['tamano_bytes']?.type).toBe('bigint');
    expect(columns['tamano_parte_bytes']?.type).toBe('bigint');
    expect(columns['upload_id']?.nullable).toBe(true);
    expect(columns['estado']?.default).toBe("'activa'::character varying");
  });

  it('CA-2: `archivo_id` y `version_id` son ids reservados sin FK (no existe aún la fila de `archivo`)', async () => {
    const foreignKeys = await inRolledBackTransaction(owner, async (runner) => {
      await insertUpload(runner, await insertAccount(runner));
      return (await runner.query(
        `SELECT a.attname FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
          WHERE c.conrelid = 'carga'::regclass AND c.contype = 'f' ORDER BY a.attname`,
      )) as { attname: string }[];
    });

    expect(foreignKeys.map((row) => row.attname)).toEqual(['propietario_id']);
  });

  it('CA-2: una carga por partes con sus tres datos y una simple sin ellos son válidas', async () => {
    const ids = await inRolledBackTransaction(owner, async (runner) => {
      const ownerId = await insertAccount(runner);
      return [
        await insertUpload(runner, ownerId, { mode: 'simple' }),
        await insertUpload(runner, ownerId, { mode: 'por_partes' }),
      ];
    });

    expect(ids).toHaveLength(2);
  });

  it.each([
    ['por partes sin `upload_id`', { mode: 'por_partes', multipart: null }],
    [
      'simple con datos de partes',
      { mode: 'simple', multipart: { uploadId: 'x', totalParts: 2, partSizeBytes: 5_242_880n } },
    ],
  ] as const)('CA-2: `ck_carga_partes` rechaza una carga %s', async (_case, options) => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        await insertUpload(runner, await insertAccount(runner), options);
      }),
    ).rejects.toThrow(/ck_carga_partes/);
  });

  it.each([
    ['rechazada sin motivo', { state: 'rechazada', rejection: null }],
    ['activa con motivo', { state: 'activa', rejection: 'tamano' }],
  ] as const)('CA-9: `ck_carga_rechazo` rechaza una carga %s', async (_case, options) => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        await insertUpload(runner, await insertAccount(runner), options);
      }),
    ).rejects.toThrow(/ck_carga_rechazo/);
  });

  it.each([
    "UPDATE carga SET estado = 'pausada'",
    "UPDATE carga SET modo = 'stream'",
    'UPDATE carga SET tamano_bytes = 0',
  ])('CA-23: los CHECK de `carga` rechazan `%s`', async (statement) => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        await insertUpload(runner, await insertAccount(runner));
        await runner.query(statement);
      }),
    ).rejects.toThrow(/violates check constraint/);
  });

  it('CA-9: el `down` borra `carga` y el `up` la recrea con los índices parciales de reservas y de barrido', async () => {
    const migration = new CrearCarga20260930100200();

    const [afterDown, indexes] = await inRolledBackTransaction(owner, async (runner) => {
      /** `acceso_rapido` (006 §9.2) referencia `archivo`: se revierte antes, como en un `migration:revert` en orden. */
      await new CrearAccesoRapido20261003100000().down(runner);
      await migration.down(runner);
      const [table] = (await runner.query("SELECT to_regclass('carga')::text AS carga")) as {
        carga: string | null;
      }[];
      await migration.up(runner);
      const rows = (await runner.query(
        "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'carga' ORDER BY indexname",
      )) as { indexname: string; indexdef: string }[];
      return [table, rows] as const;
    });

    expect(afterDown).toEqual({ carga: null });
    const partial = indexes.filter((row) =>
      row.indexdef.includes("WHERE ((estado)::text = 'activa'"),
    );
    expect(partial.map((row) => row.indexname)).toEqual([
      'idx_carga_activa_expira',
      'idx_carga_propietario_activa',
    ]);
  });
});

describe('migración politicas-rls-archivo-version-carga (CA-16, CA-17, DF-52)', () => {
  const HOUR_MS = 60 * 60 * 1000;
  const TABLES = ['archivo', 'version_archivo', 'carga'] as const;
  let app: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  const internals = {} as Record<Role.ADMIN | Role.SUPPORT | Role.OPERATOR, Actor>;
  const created: string[] = [];
  const uploads = { expired: '', expiredCancelled: '', current: '' };

  const ownedBy = (ids: readonly string[]) => (rows: { propietario_id: string }[]) =>
    rows.filter((row) => ids.includes(row.propietario_id)).length;

  /** `version_archivo` no guarda el propietario: en estas *fixtures* lo crea el propio dueño. */
  const ownersOf = (table: (typeof TABLES)[number]): string =>
    table === 'version_archivo'
      ? 'SELECT creado_por AS propietario_id FROM version_archivo'
      : `SELECT propietario_id FROM ${table}`;

  const visibleRows = (actor: Actor, table: (typeof TABLES)[number]) =>
    app.asActor(
      actor,
      async (manager) => (await manager.query(ownersOf(table))) as { propietario_id: string }[],
    );

  const countVisible = async (actor: Actor, table: (typeof TABLES)[number]): Promise<number> =>
    ownedBy([ana.id, bruno.id])(await visibleRows(actor, table));

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
    const past = new Date(Date.now() - HOUR_MS);
    await app.asActor(ana, async (manager) => {
      await insertFileWithVersion(manager, ana.id);
      uploads.expired = await insertUpload(manager, ana.id, { expiresAt: past });
      uploads.expiredCancelled = await insertUpload(manager, ana.id, {
        expiresAt: past,
        state: 'cancelada',
      });
      uploads.current = await insertUpload(manager, ana.id);
    });
    await app.asActor(bruno, async (manager) => {
      await insertFileWithVersion(manager, bruno.id);
      await insertUpload(manager, bruno.id);
    });
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
  });

  it.each(TABLES)('CA-16: `%s` tiene RLS habilitada y forzada', async (table) => {
    const [row] = (await owner.query(
      'SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE oid = $1::regclass',
      [table],
    )) as { enabled: boolean; forced: boolean }[];

    expect(row).toEqual({ enabled: true, forced: true });
  });

  it.each(TABLES)('CA-16: un cliente solo ve sus filas de `%s`', async (table) => {
    const rows = await visibleRows(ana, table);

    expect(ownedBy([ana.id])(rows)).toBeGreaterThan(0);
    expect(ownedBy([bruno.id])(rows)).toBe(0);
  });

  it('CA-16: un cliente no puede escribir un archivo a nombre de otro (WITH CHECK)', async () => {
    await expect(
      app.asActor(ana, (manager) => insertFileWithVersion(manager, bruno.id)),
    ).rejects.toThrow(/row-level security/);
  });

  it('CA-16: un cliente no puede reservar una carga a nombre de otro (WITH CHECK)', async () => {
    await expect(app.asActor(ana, (manager) => insertUpload(manager, bruno.id))).rejects.toThrow(
      /row-level security/,
    );
  });

  it.each([Role.ADMIN, Role.SUPPORT] as const)(
    'CA-17: %s lee metadatos de `archivo`, pero ninguna fila de `version_archivo` ni de `carga`',
    async (role) => {
      const actor = internals[role];

      await expect(countVisible(actor, 'archivo')).resolves.toBe(2);
      await expect(countVisible(actor, 'version_archivo')).resolves.toBe(0);
      await expect(countVisible(actor, 'carga')).resolves.toBe(0);
    },
  );

  it('CA-17: un rol interno no puede modificar `archivo` (solo tiene política de SELECT)', async () => {
    const updated = await app.asActor(internals[Role.ADMIN], async (manager) => {
      const [, affected] = (await manager.query(
        "UPDATE archivo SET nombre = 'renombrado.pdf' WHERE propietario_id = $1",
        [ana.id],
      )) as [unknown, number];
      return affected;
    });

    expect(updated).toBe(0);
  });

  it.each(TABLES)('CA-17: OPERATOR no ve filas de `%s`', async (table) => {
    await expect(countVisible(internals[Role.OPERATOR], table)).resolves.toBe(0);
  });

  it.each(TABLES)('CA-16: `nimbo_app` sin actor no ve filas de `%s`', async (table) => {
    const [row] = (await app.dataSource.query(`SELECT count(*)::int AS n FROM ${table}`)) as {
      n: number;
    }[];

    expect(row?.n).toBe(0);
  });

  it('DF-52: `carga_expiradas` devuelve solo `(id, propietario_id)` de cargas activas vencidas, sin actor', async () => {
    const rows = (await app.dataSource.query('SELECT * FROM carga_expiradas($1, $2)', [
      new Date(),
      1000,
    ])) as Record<string, string>[];
    const mine = rows.filter((row) => row['propietario_id'] === ana.id);

    expect(mine).toEqual([{ id: uploads.expired, propietario_id: ana.id }]);
  });

  it('DF-52: un `p_ahora` futuro no revela cargas vigentes (`LEAST(p_ahora, now())`)', async () => {
    const rows = (await app.dataSource.query('SELECT id FROM carga_expiradas($1, $2)', [
      new Date(Date.now() + 365 * 24 * HOUR_MS),
      1000,
    ])) as { id: string }[];

    expect(rows.map((row) => row.id)).not.toContain(uploads.current);
  });

  it.each([0, -5])('DF-52: con `p_limite = %i` no devuelve filas', async (limit) => {
    const rows = (await app.dataSource.query('SELECT id FROM carga_expiradas($1, $2)', [
      new Date(),
      limit,
    ])) as unknown[];

    expect(rows).toEqual([]);
  });

  it('DF-52: devuelve como máximo 1000 filas aunque se pidan más', async () => {
    const count = await inRolledBackTransaction(owner, async (runner) => {
      const ownerId = await insertAccount(runner);
      await runner.query(
        `INSERT INTO carga (id, propietario_id, nombre, tamano_bytes, modo, archivo_id, version_id, clave_objeto,
                            expira_en, creada_en, actualizada_en)
         SELECT gen_random_uuid(), $1, 'x.pdf', 1, 'simple', gen_random_uuid(), gen_random_uuid(), 'k' || n,
                now() - interval '1 hour', now(), now()
           FROM generate_series(1, 1001) AS n`,
        [ownerId],
      );
      const [row] = (await runner.query(
        'SELECT count(*)::int AS n FROM carga_expiradas(now(), 5000)',
      )) as { n: number }[];
      return row?.n;
    });

    expect(count).toBe(1000);
  });

  it('DF-52: `carga_expiradas` es SECURITY DEFINER con `search_path` fijo y solo la ejecuta `nimbo_app`', async () => {
    const [row] = (await owner.query(
      `SELECT p.prosecdef AS definer, p.proconfig AS config,
              has_function_privilege('nimbo_app', p.oid, 'EXECUTE') AS app,
              has_function_privilege('public', p.oid, 'EXECUTE') AS public
         FROM pg_proc p WHERE p.oid = 'carga_expiradas(timestamptz, integer)'::regprocedure`,
    )) as { definer: boolean; config: string[]; app: boolean; public: boolean }[];

    expect(row).toEqual({
      definer: true,
      config: ['search_path=pg_catalog, pg_temp'],
      app: true,
      public: false,
    });
  });

  it('CA-16: el `down` quita función, políticas y RLS, y el `up` las devuelve', async () => {
    const migration = new PoliticasRlsArchivoVersionCarga20260930100300();
    // `archivo_mantenimiento` es de 006 y el `down` de 005 no la toca.
    const snapshot = async (runner: QueryRunner) => {
      const [state] = (await runner.query(
        `SELECT (SELECT count(*)::int FROM pg_policies WHERE tablename IN ('archivo', 'version_archivo', 'carga')
                    AND policyname <> 'archivo_mantenimiento')
                  AS policies,
                (SELECT count(*)::int FROM pg_class
                  WHERE relname IN ('archivo', 'version_archivo', 'carga') AND (relrowsecurity OR relforcerowsecurity))
                  AS protected,
                to_regprocedure('carga_expiradas(timestamptz, integer)')::text AS fn`,
      )) as { policies: number; protected: number; fn: string | null }[];
      return state;
    };

    const [afterDown, afterUp] = await inRolledBackTransaction(owner, async (runner) => {
      await migration.down(runner);
      const down = await snapshot(runner);
      await migration.up(runner);
      return [down, await snapshot(runner)] as const;
    });

    expect(afterDown).toEqual({ policies: 0, protected: 0, fn: null });
    expect(afterUp).toEqual({
      policies: 5,
      protected: 3,
      fn: 'carga_expiradas(timestamp with time zone,integer)',
    });
  });
});

describe('cierre de las migraciones de 005: permisos de `nimbo_app` (RN-10, plan §4 «Permisos»)', () => {
  const tablePrivilege = async (table: string, privilege: string): Promise<boolean> => {
    const [row] = (await owner.query("SELECT has_table_privilege('nimbo_app', $1, $2) AS ok", [
      table,
      privilege,
    ])) as { ok: boolean }[];
    return row?.ok ?? false;
  };

  it.each(
    ['archivo', 'version_archivo', 'carga'].flatMap((table) =>
      ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((privilege) => [table, privilege] as const),
    ),
  )(
    'RN-10: `nimbo_app` tiene %s/%s por los privilegios por defecto de 003',
    async (table, privilege) => {
      await expect(tablePrivilege(table, privilege)).resolves.toBe(true);
    },
  );

  it('RN-10: sobre `usuario`, `nimbo_app` sigue con `UPDATE` y sin `DELETE` (como lo dejó 003)', async () => {
    const [update, remove] = [
      await tablePrivilege('usuario', 'UPDATE'),
      await tablePrivilege('usuario', 'DELETE'),
    ];

    expect({ update, remove }).toEqual({ update: true, remove: false });
  });
});

describe('cierre de las migraciones de 005: `revert` y `run` desde 005 sobre una base vacía (RNF-10)', () => {
  const STORAGE_MIGRATIONS = [
    'AgregarEspacioUsadoAUsuario20260930100000',
    'CrearArchivoYVersionArchivo20260930100100',
    'CrearCarga20260930100200',
    'PoliticasRlsArchivoVersionCarga20260930100300',
  ];
  const databaseName = `nimbo_migraciones_${String(process.pid)}_${String(Date.now())}`;
  let fresh: DataSource;

  /** Lo que dejan las cuatro migraciones: columnas, índices, restricciones, políticas, RLS y la función. */
  const schemaOf = async (dataSource: DataSource): Promise<unknown> =>
    dataSource.query(
      `SELECT
         (SELECT json_agg(c ORDER BY c.table_name, c.column_name) FROM (
            SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
             WHERE table_schema = 'public' AND (table_name IN ('archivo', 'version_archivo', 'carga')
                   OR (table_name = 'usuario' AND column_name = 'espacio_usado'))) c) AS columnas,
         (SELECT json_agg(i.indexdef ORDER BY i.indexname) FROM pg_indexes i
           WHERE i.tablename IN ('archivo', 'version_archivo', 'carga')) AS indices,
         (SELECT json_agg(k.conname ORDER BY k.conname) FROM pg_constraint k
           WHERE k.conrelid IN ('usuario'::regclass, to_regclass('archivo'), to_regclass('version_archivo'),
                                to_regclass('carga'))
             AND k.conname LIKE ANY (ARRAY['ck_%', 'fk_archivo%', 'uq_%'])) AS restricciones,
         (SELECT json_agg(p.policyname ORDER BY p.policyname) FROM pg_policies p
           WHERE p.tablename IN ('archivo', 'version_archivo', 'carga')) AS politicas,
         (SELECT json_agg(json_build_array(r.relname, r.relrowsecurity, r.relforcerowsecurity) ORDER BY r.relname)
            FROM pg_class r WHERE r.relname IN ('archivo', 'version_archivo', 'carga') AND r.relkind = 'r') AS rls,
         to_regprocedure('carga_expiradas(timestamptz, integer)')::text AS funcion`,
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

  /** Las de 005 y las que vinieron después (006…): para revertir las de 005 hay que revertir antes las posteriores. */
  const fromStorage = (applied: readonly string[]): string[] =>
    applied.slice(applied.indexOf(STORAGE_MIGRATIONS[0] ?? ''));

  it('RNF-10: todas las migraciones corren, las de 005 (y las posteriores) se revierten y vuelven a correr con el mismo esquema', async () => {
    await fresh.runMigrations({ transaction: 'each' });
    const applied = await appliedNames();
    const reverted = fromStorage(applied);
    const before = await schemaOf(fresh);

    for (const _ of reverted) {
      await fresh.undoLastMigration({ transaction: 'each' });
    }
    const afterRevert = await appliedNames();
    const [gone] = (await fresh.query(
      `SELECT to_regclass('archivo') AS archivo, to_regclass('version_archivo') AS version_archivo,
              to_regclass('carga') AS carga,
              to_regprocedure('carga_expiradas(timestamptz, integer)') AS funcion,
              (SELECT count(*)::int FROM information_schema.columns
                WHERE table_name = 'usuario' AND column_name = 'espacio_usado') AS espacio_usado`,
    )) as Record<string, unknown>[];
    const rerun = await fresh.runMigrations({ transaction: 'each' });

    expect(reverted.slice(0, STORAGE_MIGRATIONS.length)).toEqual(STORAGE_MIGRATIONS);
    expect(afterRevert).toEqual(applied.slice(0, -reverted.length));
    expect(gone).toEqual({
      archivo: null,
      version_archivo: null,
      carga: null,
      funcion: null,
      espacio_usado: 0,
    });
    expect(rerun.map((migration) => migration.name)).toEqual(reverted);
    expect(await schemaOf(fresh)).toEqual(before);
  });
});
