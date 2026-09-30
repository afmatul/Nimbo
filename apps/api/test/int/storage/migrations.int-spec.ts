import type { DataSource } from 'typeorm';

import { AgregarEspacioUsadoAUsuario20260930100000 } from '../../../src/migrations/20260930100000-agregar-espacio-usado-a-usuario';
import { CrearArchivoYVersionArchivo20260930100100 } from '../../../src/migrations/20260930100100-crear-archivo-y-version-archivo';
import { CrearCarga20260930100200 } from '../../../src/migrations/20260930100200-crear-carga';
import { connectAsOwner } from '../../support/database-urls';

import {
  columnsOf,
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  insertUpload,
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

    expect(Object.keys(file).sort()).toEqual([
      'actualizado_en',
      'creado_en',
      'eliminado_en',
      'id',
      'nombre',
      'propietario_id',
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
      'origen',
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

  it('CA-6: el mismo nombre sin distinguir mayúsculas se rechaza por propietario (`uq_archivo_propietario_nombre`)', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const ownerId = await insertAccount(runner);
        await insertFileWithVersion(runner, ownerId, { name: 'Ñandú.pdf' });
        await insertFileWithVersion(runner, ownerId, { name: 'ñandú.PDF' });
      }),
    ).rejects.toThrow(/uq_archivo_propietario_nombre/);
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

    expect(Object.keys(columns).sort()).toEqual([
      'actualizada_en',
      'archivo_id',
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
