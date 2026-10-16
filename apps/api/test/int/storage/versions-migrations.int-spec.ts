import { randomUUID } from 'node:crypto';

import type { DataSource, QueryRunner } from 'typeorm';

import { VersionesNumeroYRestauracion20261008100000 } from '../../../src/migrations/20261008100000-versiones-numero-y-restauracion';
import { connectAsOwner } from '../../support/database-urls';

import {
  columnsOf,
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  insertUpload,
} from './storage-test-db';

/**
 * Migración de 014 (plan §3) sobre el Postgres del arnés, como el dueño de las tablas. Cada caso corre en una
 * transacción que se revierte. El `revert` y `run` de todas las migraciones posteriores a 005 sobre una base vacía lo
 * cubre `migrations.int-spec.ts` (RNF-10).
 */
const migration = new VersionesNumeroYRestauracion20261008100000();

let owner: DataSource;

beforeAll(async () => {
  owner = await connectAsOwner();
});

afterAll(async () => {
  await owner.destroy();
});

/** Otra versión del archivo, con su número y, si se pide, el de la versión restaurada. */
const insertVersion = async (
  runner: QueryRunner,
  file: { ownerId: string; fileId: string },
  numbers: { number: number; restoredFrom?: number },
): Promise<void> => {
  const versionId = randomUUID();
  await runner.query(
    `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero,
                                  restaurada_de_numero)
     VALUES ($1, $2, 'restauracion', $3, 1024, $4, now(), $5, $6)`,
    [
      versionId,
      file.fileId,
      `u/${file.ownerId}/${file.fileId}/${versionId}`,
      file.ownerId,
      numbers.number,
      numbers.restoredFrom ?? null,
    ],
  );
};

/** Archivo con su versión como los dejaba 005, sin `numero` (el esquema antes de esta migración). */
const insertLegacyFile = async (runner: QueryRunner, ownerId: string): Promise<string> => {
  const fileId = randomUUID();
  const versionId = randomUUID();
  await runner.query(
    `INSERT INTO archivo (id, propietario_id, nombre, tipo, tamano_bytes, version_actual_id, creado_en, actualizado_en)
     VALUES ($1, $2, $3, 'pdf', 1024, $4, now(), now())`,
    [fileId, ownerId, `informe-${fileId}.pdf`, versionId],
  );
  await runner.query(
    `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en)
     VALUES ($1, $2, 'carga', $3, 1024, $4, now())`,
    [versionId, fileId, `u/${ownerId}/${fileId}/${versionId}`, ownerId],
  );
  return fileId;
};

const fileWithVersion = async (runner: QueryRunner) => {
  const ownerId = await insertAccount(runner);
  const { fileId } = await insertFileWithVersion(runner, ownerId);
  return { ownerId, fileId };
};

describe('migración versiones-numero-y-restauracion (CA-4, plan §3)', () => {
  it('CA-4: `version_archivo` agrega `numero` obligatorio sin valor por defecto y `restaurada_de_numero` opcional', async () => {
    const columns = await inRolledBackTransaction(owner, (runner) =>
      columnsOf(runner, 'version_archivo'),
    );

    expect(columns['numero']).toEqual({ type: 'integer', nullable: false, default: null });
    expect(columns['restaurada_de_numero']).toEqual({
      type: 'integer',
      nullable: true,
      default: null,
    });
  });

  it('CA-1: `carga.reemplaza` es `boolean NOT NULL DEFAULT false`: una carga sin el dato no reemplaza', async () => {
    const [column, replaces] = await inRolledBackTransaction(owner, async (runner) => {
      const id = await insertUpload(runner, await insertAccount(runner));
      const [row] = (await runner.query('SELECT reemplaza FROM carga WHERE id = $1', [id])) as {
        reemplaza: boolean;
      }[];
      return [(await columnsOf(runner, 'carga'))['reemplaza'], row?.reemplaza];
    });

    expect(column).toEqual({ type: 'boolean', nullable: false, default: 'false' });
    expect(replaces).toBe(false);
  });

  it('CA-9: `restaurada_de_numero` es un número, no una FK: sobrevive a la poda de su versión', async () => {
    const [row] = (await owner.query(
      `SELECT count(*)::int AS n FROM pg_constraint
        WHERE conrelid = 'version_archivo'::regclass AND contype = 'f'
          AND conkey @> ARRAY[(SELECT attnum FROM pg_attribute
                                WHERE attrelid = 'version_archivo'::regclass AND attname = 'restaurada_de_numero')]`,
    )) as { n: number }[];

    expect(row?.n).toBe(0);
  });

  it('CA-4: dos versiones del mismo archivo no comparten número (`uq_version_archivo_numero`)', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const file = await fileWithVersion(runner);
        await insertVersion(runner, file, { number: 1 });
      }),
    ).rejects.toThrow(/uq_version_archivo_numero/);
  });

  it('CA-4, CA-9: la siguiente versión toma el número siguiente y puede venir de una anterior', async () => {
    const numbers = await inRolledBackTransaction(owner, async (runner) => {
      const file = await fileWithVersion(runner);
      await insertVersion(runner, file, { number: 2 });
      await insertVersion(runner, file, { number: 3, restoredFrom: 1 });
      return (await runner.query(
        'SELECT numero, restaurada_de_numero FROM version_archivo WHERE archivo_id = $1 ORDER BY numero',
        [file.fileId],
      )) as { numero: number; restaurada_de_numero: number | null }[];
    });

    expect(numbers).toEqual([
      { numero: 1, restaurada_de_numero: null },
      { numero: 2, restaurada_de_numero: null },
      { numero: 3, restaurada_de_numero: 1 },
    ]);
  });

  it.each([
    ['un número en cero', { number: 0 }],
    ['un origen igual a su propio número', { number: 2, restoredFrom: 2 }],
    ['un origen posterior', { number: 2, restoredFrom: 3 }],
    ['un origen en cero', { number: 2, restoredFrom: 0 }],
  ])('CA-9: `ck_version_numero` rechaza %s', async (_case, numbers) => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        await insertVersion(runner, await fileWithVersion(runner), numbers);
      }),
    ).rejects.toThrow(/ck_version_numero/);
  });

  it('RNF-10: el `up` numera 1 la versión que ya existía; el `down` quita columnas, índice y restricción', async () => {
    const [afterDown, afterUp] = await inRolledBackTransaction(owner, async (runner) => {
      await migration.down(runner);
      const legacyFileId = await insertLegacyFile(runner, await insertAccount(runner));
      const down = await schemaOf(runner);
      await migration.up(runner);
      const [row] = (await runner.query(
        'SELECT numero, restaurada_de_numero FROM version_archivo WHERE archivo_id = $1',
        [legacyFileId],
      )) as { numero: number; restaurada_de_numero: number | null }[];
      return [down, { ...(await schemaOf(runner)), legacy: row }];
    });

    expect(afterDown).toEqual({ columns: [], index: null, check: null });
    expect(afterUp).toEqual({
      columns: ['numero', 'reemplaza', 'restaurada_de_numero'],
      index: 'uq_version_archivo_numero',
      check: 'ck_version_numero',
      legacy: { numero: 1, restaurada_de_numero: null },
    });
  });
});

/** Lo que agrega esta migración: sus tres columnas, su índice único y su `CHECK`. */
async function schemaOf(
  runner: QueryRunner,
): Promise<{ columns: string[]; index: string | null; check: string | null }> {
  const columns = (await runner.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'version_archivo' AND column_name IN ('numero', 'restaurada_de_numero'))
          OR (table_name = 'carga' AND column_name = 'reemplaza'))
      ORDER BY column_name`,
  )) as { column_name: string }[];
  const [names] = (await runner.query(
    `SELECT to_regclass('uq_version_archivo_numero')::text AS index,
            (SELECT conname::text FROM pg_constraint WHERE conname = 'ck_version_numero') AS check`,
  )) as { index: string | null; check: string | null }[];
  return {
    columns: columns.map((row) => row.column_name),
    index: names?.index ?? null,
    check: names?.check ?? null,
  };
}
