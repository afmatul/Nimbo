import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { CrearOptimizacion20261026100000 } from '../../../src/migrations/20261026100000-crear-optimizacion';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase, Queryable } from '../storage/storage-test-db';
import {
  columnsOf,
  connectAsAppDatabase,
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  removeAccounts,
} from '../storage/storage-test-db';

const migration = new CrearOptimizacion20261026100000();

interface FileVersionRow {
  readonly fileId: string;
  readonly versionId: string;
}

interface OptimizationRowOptions {
  readonly state?: string;
  readonly reason?: string | null;
  readonly originalBytes?: bigint;
  readonly estimatedBytes?: bigint | null;
  readonly resultBytes?: bigint | null;
  readonly resultVersionId?: string | null;
}

/** Fila de `optimizacion` como el dueño de las tablas (sin RLS). */
const insertOptimization = async (
  runner: Queryable,
  version: FileVersionRow,
  options: OptimizationRowOptions = {},
): Promise<string> => {
  const id = randomUUID();
  await runner.query(
    `INSERT INTO optimizacion (id, archivo_id, version_origen_id, estado, motivo, bytes_origen, bytes_estimados,
                               bytes_resultado, version_resultado_id, creado_en, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())`,
    [
      id,
      version.fileId,
      version.versionId,
      options.state ?? 'estimando',
      options.reason ?? null,
      String(options.originalBytes ?? 4096n),
      options.estimatedBytes?.toString() ?? null,
      options.resultBytes?.toString() ?? null,
      options.resultVersionId ?? null,
    ],
  );
  return id;
};

const countOf = async (runner: Queryable, fileId?: string): Promise<number> => {
  const rows = (await (fileId === undefined
    ? runner.query('SELECT count(*)::int AS n FROM optimizacion')
    : runner.query('SELECT count(*)::int AS n FROM optimizacion WHERE archivo_id = $1', [
        fileId,
      ]))) as { n: number }[];
  return rows[0]?.n ?? 0;
};

/** Tabla y política de la migración, para comparar `down` y `up`. */
const schemaOf = async (runner: Queryable): Promise<{ tables: string[]; policies: string[] }> => {
  const tables = (await runner.query(
    "SELECT tablename FROM pg_tables WHERE tablename = 'optimizacion'",
  )) as { tablename: string }[];
  const policies = (await runner.query(
    "SELECT policyname FROM pg_policies WHERE tablename = 'optimizacion'",
  )) as { policyname: string }[];
  return {
    tables: tables.map((row) => row.tablename),
    policies: policies.map((row) => row.policyname),
  };
};

let owner: DataSource;

beforeAll(async () => {
  owner = await connectAsOwner();
});

afterAll(async () => {
  await owner.destroy();
});

const fileOf = async (runner: Queryable): Promise<FileVersionRow> =>
  insertFileWithVersion(runner, await insertAccount(runner));

const rejects = (options: OptimizationRowOptions, constraint: RegExp): Promise<void> =>
  expect(
    inRolledBackTransaction(owner, async (runner) => {
      await insertOptimization(runner, await fileOf(runner), options);
    }),
  ).rejects.toThrow(constraint);

describe('migración crear-optimizacion (plan 021 §3)', () => {
  it('guarda archivo, versiones de origen y resultado, estado, motivo, bytes y fechas; sin dueño ni nombres', async () => {
    const columns = await inRolledBackTransaction(owner, (runner) =>
      columnsOf(runner, 'optimizacion'),
    );

    expect(Object.keys(columns).sort()).toEqual(
      [
        'actualizado_en',
        'archivo_id',
        'bytes_estimados',
        'bytes_origen',
        'bytes_resultado',
        'creado_en',
        'estado',
        'id',
        'motivo',
        'version_origen_id',
        'version_resultado_id',
      ].sort(),
    );
    expect(columns['bytes_origen']?.type).toBe('bigint');
    expect(columns['version_resultado_id']?.nullable).toBe(true);
  });

  it('acepta un estado en curso sin motivo y los finales con su motivo', async () => {
    const states = await inRolledBackTransaction(owner, async (runner) => {
      for (const options of [
        { state: 'estimando' },
        { state: 'no_disponible', reason: 'tamano' },
        { state: 'fallida', reason: 'servicio_no_disponible' },
      ]) {
        await insertOptimization(runner, await fileOf(runner), options);
      }
      return (await runner.query('SELECT estado FROM optimizacion ORDER BY estado')) as {
        estado: string;
      }[];
    });

    expect(states.map((row) => row.estado)).toEqual(['estimando', 'fallida', 'no_disponible']);
  });

  it.each<[string, OptimizationRowOptions]>([
    ['un `fallida` sin motivo', { state: 'fallida', reason: null }],
    ['un `estimando` con motivo', { state: 'estimando', reason: 'tamano' }],
  ])('`ck_optimizacion_motivo` rechaza %s', async (_case, options) => {
    await rejects(options, /ck_optimizacion_motivo/);
  });

  const RUN = { estimatedBytes: 2048n, resultVersionId: randomUUID() };

  it('acepta cada estado con los datos que el dominio le exige (`OptimizationJob.assertInvariants`)', async () => {
    const valid: OptimizationRowOptions[] = [
      { state: 'estimando' },
      { state: 'estimada', estimatedBytes: 2048n },
      { state: 'no_conviene', estimatedBytes: 4000n },
      { state: 'no_disponible', reason: 'pixeles' },
      { state: 'optimizando', ...RUN },
      { state: 'completada', ...RUN, resultBytes: 2000n },
      { state: 'descartada', reason: 'version_cambiada', ...RUN },
      { state: 'descartada', reason: 'ahorro_minimo', ...RUN, resultBytes: 4000n },
      { state: 'fallida', reason: 'servicio_no_disponible' },
      { state: 'fallida', reason: 'servicio_no_disponible', ...RUN },
    ];
    const count = await inRolledBackTransaction(owner, async (runner) => {
      for (const options of valid) {
        await insertOptimization(runner, await fileOf(runner), {
          ...options,
          resultVersionId: options.resultVersionId === undefined ? null : randomUUID(),
        });
      }
      return countOf(runner);
    });

    expect(count).toBeGreaterThanOrEqual(valid.length);
  });

  it.each<[string, OptimizationRowOptions, RegExp]>([
    [
      'un `optimizando` sin versión de resultado',
      { state: 'optimizando', estimatedBytes: 2048n },
      /ck_optimizacion_version_resultado/,
    ],
    [
      'un `completada` sin versión de resultado',
      { state: 'completada', estimatedBytes: 2048n, resultBytes: 2000n },
      /ck_optimizacion_version_resultado/,
    ],
    [
      'una versión de resultado en una `estimada`',
      { state: 'estimada', ...RUN },
      /ck_optimizacion_version_resultado/,
    ],
    [
      'una `estimada` sin bytes estimados',
      { state: 'estimada' },
      /ck_optimizacion_bytes_estimados/,
    ],
    [
      'una ejecución sin bytes estimados',
      { state: 'optimizando', resultVersionId: randomUUID() },
      /ck_optimizacion_bytes_estimados/,
    ],
    [
      'bytes reales en un `optimizando`',
      { state: 'optimizando', ...RUN, resultBytes: 2000n },
      /ck_optimizacion_bytes_resultado/,
    ],
    [
      'un `completada` sin bytes reales',
      { state: 'completada', ...RUN },
      /ck_optimizacion_completada/,
    ],
    [
      'un `completada` que no ahorra',
      { state: 'completada', ...RUN, resultBytes: 4096n },
      /ck_optimizacion_completada/,
    ],
  ])('rechaza %s, como el dominio', async (_case, options, constraint) => {
    await rejects(options, constraint);
  });

  it.each<[string, OptimizationRowOptions, RegExp]>([
    ['un estado desconocido', { state: 'pausada' }, /ck_optimizacion_estado/],
    [
      'un motivo desconocido',
      { state: 'fallida', reason: 'cansancio' },
      /ck_optimizacion_motivo_valor/,
    ],
    ['bytes de origen no positivos', { originalBytes: 0n }, /check constraint/],
  ])('rechaza %s', async (_case, options, constraint) => {
    await rejects(options, constraint);
  });

  it('RN-9: a lo sumo una en curso por archivo (`uq_optimizacion_en_curso`)', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const version = await fileOf(runner);
        await insertOptimization(runner, version, { state: 'estimando' });
        await insertOptimization(runner, version, {
          state: 'optimizando',
          estimatedBytes: 2048n,
          resultVersionId: randomUUID(),
        });
      }),
    ).rejects.toThrow(/uq_optimizacion_en_curso/);
  });

  it('las finales no ocupan el lugar de la en curso: historial de pedidos del mismo archivo', async () => {
    const count = await inRolledBackTransaction(owner, async (runner) => {
      const version = await fileOf(runner);
      await insertOptimization(runner, version, { state: 'fallida', reason: 'integridad' });
      await insertOptimization(runner, version, { state: 'estimada', estimatedBytes: 2048n });
      await insertOptimization(runner, version, { state: 'estimando' });
      return countOf(runner, version.fileId);
    });

    expect(count).toBe(3);
  });

  it('purgar el archivo borra sus optimizaciones; podar una versión, no (sin FK a versiones)', async () => {
    const [afterVersion, afterFile] = await inRolledBackTransaction(owner, async (runner) => {
      const version = await fileOf(runner);
      await insertOptimization(
        runner,
        { ...version, versionId: randomUUID() },
        {
          state: 'fallida',
          reason: 'integridad',
        },
      );
      const left = await countOf(runner, version.fileId);
      await runner.query('DELETE FROM archivo WHERE id = $1', [version.fileId]);
      return [left, await countOf(runner, version.fileId)];
    });

    expect(afterVersion).toBe(1);
    expect(afterFile).toBe(0);
  });

  it('crea el índice por archivo y fecha y el único parcial de lo en curso', async () => {
    const indexes = (await owner.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'optimizacion' ORDER BY indexname`,
    )) as { indexname: string; indexdef: string }[];
    const byName = Object.fromEntries(indexes.map((row) => [row.indexname, row.indexdef]));

    expect(byName['idx_optimizacion_archivo']).toMatch(/\(archivo_id, creado_en DESC\)/);
    expect(byName['uq_optimizacion_en_curso']).toMatch(
      /UNIQUE.*\(archivo_id\).*WHERE.*estimando.*optimizando/,
    );
  });

  it('RNF-10: `down` y `up` dejan el mismo esquema', async () => {
    const [afterDown, afterUp] = await inRolledBackTransaction(owner, async (runner) => {
      await migration.down(runner);
      const down = await schemaOf(runner);
      await migration.up(runner);
      return [down, await schemaOf(runner)];
    });

    expect(afterDown).toEqual({ tables: [], policies: [] });
    expect(afterUp).toEqual({ tables: ['optimizacion'], policies: ['optimizacion_cliente'] });
  });
});

describe('RLS de `optimizacion` (plan 021 §3, RNF-05)', () => {
  let app: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  const created: string[] = [];

  const visible = (actor: Actor): Promise<number> =>
    app.asActor(actor, (manager) => countOf(manager));

  beforeAll(async () => {
    app = await connectAsAppDatabase();
    const ids = await owner.transaction(async (manager) => {
      const anaId = await insertAccount(manager);
      const brunoId = await insertAccount(manager);
      await insertOptimization(manager, await insertFileWithVersion(manager, anaId));
      return { anaId, brunoId };
    });
    created.push(ids.anaId, ids.brunoId);
    ana = createActor(ids.anaId, Role.CLIENT);
    bruno = createActor(ids.brunoId, Role.CLIENT);
  });

  afterAll(async () => {
    await removeAccounts(owner, created);
    await app.dataSource.destroy();
  });

  it('el dueño del archivo ve su optimización; otro cliente, ninguna', async () => {
    expect(await visible(ana)).toBe(1);
    expect(await visible(bruno)).toBe(0);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'el rol interno %s no ve ninguna',
    async (role) => {
      expect(await visible(createActor(randomUUID(), role))).toBe(0);
    },
  );

  it('un cliente no puede insertar una optimización sobre un archivo ajeno', async () => {
    const [anaFile] = (await owner.query(
      `SELECT archivo_id, version_origen_id FROM optimizacion o JOIN archivo a ON a.id = o.archivo_id
        WHERE a.propietario_id = $1`,
      [ana.id],
    )) as { archivo_id: string; version_origen_id: string }[];

    await expect(
      app.asActor(bruno, (manager) =>
        insertOptimization(
          manager,
          { fileId: anaFile?.archivo_id ?? '', versionId: anaFile?.version_origen_id ?? '' },
          { state: 'fallida', reason: 'integridad' },
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
