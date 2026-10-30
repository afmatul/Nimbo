import type { DataSource, QueryRunner } from 'typeorm';

import { CrearIndexacionYFragmento20261022100000 } from '../../../src/migrations/20261022100000-crear-indexacion-y-fragmento';
import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import {
  columnsOf,
  connectAsAppDatabase,
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  removeAccounts,
} from '../storage/storage-test-db';

import { countRows, insertChunk, insertIndexing } from './intelligence-test-db';
import type {
  ChunkRowOptions,
  IndexedVersionRow,
  IndexingRowOptions,
} from './intelligence-test-db';

/**
 * Migración de 019 (plan §3) sobre el Postgres del arnés, como el dueño de las tablas. Los casos de esquema corren en
 * una transacción que se revierte; los de RLS confirman *fixtures* como `nimbo_app` dentro de `withActor`.
 */
const migration = new CrearIndexacionYFragmento20261022100000();
const TABLES = ['indexacion', 'fragmento'] as const;

let owner: DataSource;

beforeAll(async () => {
  owner = await connectAsOwner();
});

afterAll(async () => {
  await owner.destroy();
});

const indexedVersion = async (runner: QueryRunner): Promise<IndexedVersionRow> =>
  insertFileWithVersion(runner, await insertAccount(runner));

/** Filas de `indexacion` más `fragmento` del archivo. */
const rowsOf = async (runner: QueryRunner, fileId: string): Promise<number> =>
  (await countRows(runner, 'indexacion', fileId)) + (await countRows(runner, 'fragmento', fileId));

/** Versión 2 del archivo, que no es la vigente: se puede borrar como lo hace la retención (014). */
const insertOlderVersion = async (
  runner: QueryRunner,
  current: IndexedVersionRow,
): Promise<string> => {
  const [row] = (await runner.query(
    `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero)
     SELECT gen_random_uuid(), v.archivo_id, 'carga', v.clave_objeto || '-2', v.tamano_bytes, v.creado_por, now(), 2
       FROM version_archivo v WHERE v.id = $1
     RETURNING id`,
    [current.versionId],
  )) as { id: string }[];
  if (row === undefined) throw new Error('No se creó la versión anterior.');
  return row.id;
};

const rejectsIndexing = (options: IndexingRowOptions, constraint: RegExp): Promise<void> =>
  expect(
    inRolledBackTransaction(owner, async (runner) => {
      await insertIndexing(runner, await indexedVersion(runner), options);
    }),
  ).rejects.toThrow(constraint);

const rejectsChunk = (options: ChunkRowOptions, constraint: RegExp): Promise<void> =>
  expect(
    inRolledBackTransaction(owner, async (runner) => {
      await insertChunk(runner, await indexedVersion(runner), options);
    }),
  ).rejects.toThrow(constraint);

describe('migración crear-indexacion-y-fragmento (plan 019 §3)', () => {
  it('CA-13: `indexacion` guarda archivo, versión, estado, motivo, intentos, fragmentos, duración y fechas', async () => {
    const columns = await inRolledBackTransaction(owner, (runner) =>
      columnsOf(runner, 'indexacion'),
    );

    expect(Object.keys(columns).sort()).toEqual(
      [
        'actualizado_en',
        'archivo_id',
        'creado_en',
        'duracion_ms',
        'estado',
        'fragmentos',
        'id',
        'intentos',
        'motivo',
        'version_archivo_id',
      ].sort(),
    );
    expect(columns['motivo']?.nullable).toBe(true);
    expect(columns['duracion_ms']?.nullable).toBe(true);
  });

  it('CA-17: `fragmento` guarda archivo, versión, orden, texto, procedencia `jsonb`, vector y texto de búsqueda', async () => {
    const columns = await inRolledBackTransaction(owner, (runner) =>
      columnsOf(runner, 'fragmento'),
    );

    expect(Object.keys(columns).sort()).toEqual(
      [
        'archivo_id',
        'creado_en',
        'embedding',
        'id',
        'orden',
        'procedencia',
        'texto',
        'texto_busq',
        'version_archivo_id',
      ].sort(),
    );
    expect(columns['procedencia']?.type).toBe('jsonb');
    expect(columns['texto_busq']?.type).toBe('tsvector');
  });

  it('CA-13: `pendiente` sin motivo y `fallido` o `no_indexable` con motivo son válidos', async () => {
    const states = await inRolledBackTransaction(owner, async (runner) => {
      for (const options of [
        { state: 'pendiente' },
        { state: 'fallido', reason: 'proveedor_no_disponible' },
        { state: 'no_indexable', reason: 'sin_texto' },
      ]) {
        await insertIndexing(runner, await indexedVersion(runner), options);
      }
      return (await runner.query('SELECT estado FROM indexacion ORDER BY estado')) as {
        estado: string;
      }[];
    });

    expect(states.map((row) => row.estado)).toEqual(['fallido', 'no_indexable', 'pendiente']);
  });

  it.each<[string, IndexingRowOptions]>([
    ['un `fallido` sin motivo', { state: 'fallido', reason: null }],
    ['un `no_indexable` sin motivo', { state: 'no_indexable', reason: null }],
    ['un `indexado` con motivo', { state: 'indexado', reason: 'sin_texto' }],
  ])('CA-13: `ck_indexacion_motivo` rechaza %s', async (_case, options) => {
    await rejectsIndexing(options, /ck_indexacion_motivo/);
  });

  it.each<[string, IndexingRowOptions]>([
    ['un estado desconocido', { state: 'pausado' }],
    ['un motivo desconocido', { state: 'fallido', reason: 'cansancio' }],
  ])('CA-13: rechaza %s', async (_case, options) => {
    await rejectsIndexing(options, /check constraint/);
  });

  it('CA-9: una versión tiene una sola `indexacion` (`uq_indexacion_version`)', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const version = await indexedVersion(runner);
        await insertIndexing(runner, version);
        await insertIndexing(runner, version, { state: 'indexando' });
      }),
    ).rejects.toThrow(/uq_indexacion_version/);
  });

  it('CA-9: una versión no repite el orden de un fragmento (`uq_fragmento_version_orden`)', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const version = await indexedVersion(runner);
        await insertChunk(runner, version, { order: 0 });
        await insertChunk(runner, version, { order: 0 });
      }),
    ).rejects.toThrow(/uq_fragmento_version_orden/);
  });

  it.each<[string, unknown]>([
    ['sin `tipo`', { pagina: 1 }],
    ['que no es un objeto', [{ tipo: 'pdf' }]],
  ])('CA-1: rechaza una procedencia %s (DF-07)', async (_case, location) => {
    await rejectsChunk({ location }, /check constraint/);
  });

  it('CA-17: el vector tiene 768 dimensiones', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const version = await indexedVersion(runner);
        await runner.query(
          `INSERT INTO fragmento (id, archivo_id, version_archivo_id, orden, texto, procedencia, embedding, creado_en)
           VALUES (gen_random_uuid(), $1, $2, 0, 'x', '{"tipo":"texto"}', '[1,0,0]'::vector, now())`,
          [version.fileId, version.versionId],
        );
      }),
    ).rejects.toThrow(/768 dimensions/);
  });

  it('PD-127: `texto_busq` se genera del texto en español (lo consume 018)', async () => {
    const [row] = await inRolledBackTransaction(owner, async (runner) => {
      const version = await indexedVersion(runner);
      await insertChunk(runner, version, { text: 'Las ventas del trimestre crecieron' });
      return (await runner.query(
        "SELECT texto_busq @@ to_tsquery('spanish', 'venta & crecer') AS coincide FROM fragmento WHERE archivo_id = $1",
        [version.fileId],
      )) as { coincide: boolean }[];
    });

    expect(row?.coincide).toBe(true);
  });

  it('CA-15: borrar una versión borra su estado y sus fragmentos; borrar el archivo (purga), todos', async () => {
    const [afterVersion, afterFile] = await inRolledBackTransaction(owner, async (runner) => {
      const current = await indexedVersion(runner);
      const older = {
        fileId: current.fileId,
        versionId: await insertOlderVersion(runner, current),
      };
      for (const version of [current, older]) {
        await insertIndexing(runner, version);
        await insertChunk(runner, version);
      }
      await runner.query('DELETE FROM version_archivo WHERE id = $1', [older.versionId]);
      const left = await rowsOf(runner, current.fileId);
      await runner.query('DELETE FROM archivo WHERE id = $1', [current.fileId]);
      return [left, await rowsOf(runner, current.fileId)];
    });

    expect(afterVersion).toBe(2);
    expect(afterFile).toBe(0);
  });

  it('plan §3: crea los índices de archivo, conciliación, HNSW por coseno y GIN de texto', async () => {
    const indexes = (await owner.query(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE tablename IN ('indexacion', 'fragmento') AND indexname LIKE 'idx_%' ORDER BY indexname`,
    )) as { indexname: string; indexdef: string }[];
    const byName = Object.fromEntries(indexes.map((row) => [row.indexname, row.indexdef]));

    expect(Object.keys(byName)).toEqual([
      'idx_fragmento_archivo',
      'idx_fragmento_embedding',
      'idx_fragmento_texto_busq',
      'idx_indexacion_archivo',
      'idx_indexacion_pendiente',
    ]);
    expect(byName['idx_fragmento_embedding']).toMatch(/USING hnsw \(embedding vector_cosine_ops\)/);
    expect(byName['idx_fragmento_texto_busq']).toMatch(/USING gin \(texto_busq\)/);
    expect(byName['idx_indexacion_pendiente']).toMatch(/WHERE.*pendiente.*indexando/);
  });

  it('RNF-10: `down` y `up` dejan el mismo esquema', async () => {
    const [afterDown, afterUp] = await inRolledBackTransaction(owner, async (runner) => {
      await migration.down(runner);
      const down = await intelligenceSchemaOf(runner);
      await migration.up(runner);
      return [down, await intelligenceSchemaOf(runner)];
    });

    expect(afterDown).toEqual({ tables: [], policies: [] });
    expect(afterUp).toEqual({
      tables: ['fragmento', 'indexacion'],
      policies: ['fragmento_cliente', 'indexacion_cliente'],
    });
  });
});

describe('RLS de `indexacion` y `fragmento` (plan 019 §3, RNF-05)', () => {
  let app: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  let anaVersion: IndexedVersionRow;
  const internals = {} as Record<Role.ADMIN | Role.SUPPORT | Role.OPERATOR, Actor>;
  const created: string[] = [];

  const visible = (actor: Actor, table: (typeof TABLES)[number]): Promise<number> =>
    app.asActor(actor, (manager) => countRows(manager, table));

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
    anaVersion = await app.asActor(ana, async (manager) => {
      const version = await insertFileWithVersion(manager, ana.id);
      await insertIndexing(manager, version, { state: 'indexado' });
      await insertChunk(manager, version);
      return version;
    });
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
  });

  it.each(TABLES)(
    'RNF-05: `%s` tiene RLS habilitada y forzada, con la política de cliente y la de lectura de lo compartido (012)',
    async (table) => {
      const [rls] = (await owner.query(
        'SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE oid = $1::regclass',
        [table],
      )) as { enabled: boolean; forced: boolean }[];
      const policies = (await owner.query(
        'SELECT policyname, cmd FROM pg_policies WHERE tablename = $1 ORDER BY policyname',
        [table],
      )) as { policyname: string; cmd: string }[];
      const shared = table === 'fragmento' ? 'fragmento_compartido' : 'indexacion_compartida';

      expect(rls).toEqual({ enabled: true, forced: true });
      expect(policies).toEqual([
        { policyname: `${table}_cliente`, cmd: 'ALL' },
        { policyname: shared, cmd: 'SELECT' },
      ]);
    },
  );

  it('CA-17: la propietaria ve el estado y los fragmentos de su archivo; otro cliente no ve nada', async () => {
    await expect(visible(ana, 'indexacion')).resolves.toBe(1);
    await expect(visible(ana, 'fragmento')).resolves.toBe(1);
    await expect(visible(bruno, 'indexacion')).resolves.toBe(0);
    await expect(visible(bruno, 'fragmento')).resolves.toBe(0);
  });

  it('CA-17: un cliente no escribe estado ni fragmentos sobre un archivo ajeno (WITH CHECK)', async () => {
    await expect(
      app.asActor(bruno, (manager) => insertIndexing(manager, anaVersion)),
    ).rejects.toThrow(/row-level security/);
    await expect(
      app.asActor(bruno, (manager) => insertChunk(manager, anaVersion, { order: 9 })),
    ).rejects.toThrow(/row-level security/);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const)(
    'CA-20: %s no ve filas de `indexacion` ni de `fragmento`',
    async (role) => {
      await expect(visible(internals[role], 'indexacion')).resolves.toBe(0);
      await expect(visible(internals[role], 'fragmento')).resolves.toBe(0);
    },
  );

  it.each(TABLES)('RNF-05: `nimbo_app` sin actor no ve filas de `%s`', async (table) => {
    await expect(countRows(app.dataSource, table)).resolves.toBe(0);
  });

  it('CA-15: la purga hecha por la propietaria arrastra estado y fragmentos aunque la cascada no pase por RLS', async () => {
    const version = await app.asActor(ana, async (manager) => {
      const purged = await insertFileWithVersion(manager, ana.id);
      await insertIndexing(manager, purged);
      await insertChunk(manager, purged);
      return purged;
    });

    await app.asActor(ana, (manager) =>
      manager.query('DELETE FROM archivo WHERE id = $1', [version.fileId]),
    );

    await expect(countRows(owner, 'indexacion', version.fileId)).resolves.toBe(0);
    await expect(countRows(owner, 'fragmento', version.fileId)).resolves.toBe(0);
  });
});

/** Lo que crea la migración: tablas y políticas. */
async function intelligenceSchemaOf(
  runner: QueryRunner,
): Promise<{ tables: string[]; policies: string[] }> {
  const tables = (await runner.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('indexacion', 'fragmento') ORDER BY table_name`,
  )) as { table_name: string }[];
  const policies = (await runner.query(
    "SELECT policyname FROM pg_policies WHERE tablename IN ('indexacion', 'fragmento') ORDER BY policyname",
  )) as { policyname: string }[];
  return {
    tables: tables.map((row) => row.table_name),
    policies: policies.map((row) => row.policyname),
  };
}
