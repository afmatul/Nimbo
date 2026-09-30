import { randomUUID } from 'node:crypto';

import { LEGAL_DOCUMENTS } from '@nimbo/contracts';
import type { DataSource, QueryRunner } from 'typeorm';

import { Role } from '../../../src/shared';

/** PHC de relleno: nadie inicia sesión con estas cuentas. */
const PLACEHOLDER_PHC = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdGVuaXNv$c3RvcmFnZQ';
const ACCEPTED_AT = new Date('2026-09-01T09:00:00.000Z');

/**
 * Corre `work` en una transacción de `dataSource` que siempre se revierte: las pruebas de esquema de 005 no dejan
 * filas ni cambios de DDL en la base compartida del arnés.
 */
export const inRolledBackTransaction = async <T>(
  dataSource: DataSource,
  work: (runner: QueryRunner) => Promise<T>,
): Promise<T> => {
  const runner = dataSource.createQueryRunner();
  await runner.startTransaction();
  try {
    return await work(runner);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
};

/** Inserta una cuenta (como el dueño: `usuario` es un *fixture* aquí) y devuelve su id. */
export const insertAccount = async (
  runner: Pick<QueryRunner, 'query'>,
  role: Role = Role.CLIENT,
): Promise<string> => {
  const id = randomUUID();
  const isClient = role === Role.CLIENT;
  await runner.query(
    `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, correo_verificado, version_terminos,
                          version_privacidad, terminos_aceptados_en)
     VALUES ($1, 'Ana López', $2, $3, $4, true, $5, $6, $7)`,
    [
      id,
      `storage.${id}@ejemplo.com`,
      PLACEHOLDER_PHC,
      role,
      isClient ? LEGAL_DOCUMENTS.terms.version : null,
      isClient ? LEGAL_DOCUMENTS.privacy.version : null,
      isClient ? ACCEPTED_AT : null,
    ],
  );
  return id;
};

/** Filas de `information_schema.columns` de una tabla, por nombre de columna. */
export const columnsOf = async (
  runner: Pick<QueryRunner, 'query'>,
  table: string,
): Promise<Record<string, { type: string; nullable: boolean; default: string | null }>> => {
  const rows = (await runner.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  )) as {
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }[];
  return Object.fromEntries(
    rows.map((row) => [
      row.column_name,
      { type: row.data_type, nullable: row.is_nullable === 'YES', default: row.column_default },
    ]),
  );
};

export interface FileRowOptions {
  readonly name?: string;
  readonly sizeBytes?: bigint;
  readonly deletedAt?: Date | null;
}

/**
 * Inserta `archivo` y su `version_archivo` en la misma transacción (la FK `version_actual_id` es diferida) y devuelve
 * ambos ids. La clave de objeto sigue el formato `u/{propietario}/{archivo}/{version}`.
 */
export const insertFileWithVersion = async (
  runner: Pick<QueryRunner, 'query'>,
  ownerId: string,
  options: FileRowOptions = {},
): Promise<{ fileId: string; versionId: string }> => {
  const fileId = randomUUID();
  const versionId = randomUUID();
  const size = String(options.sizeBytes ?? 1024n);
  const now = new Date();
  await runner.query(
    `INSERT INTO archivo (id, propietario_id, nombre, tipo, tamano_bytes, version_actual_id, creado_en,
                          actualizado_en, eliminado_en)
     VALUES ($1, $2, $3, 'pdf', $4, $5, $6, $6, $7)`,
    [
      fileId,
      ownerId,
      options.name ?? `informe-${fileId}.pdf`,
      size,
      versionId,
      now,
      options.deletedAt ?? null,
    ],
  );
  await runner.query(
    `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en)
     VALUES ($1, $2, 'carga', $3, $4, $5, $6)`,
    [versionId, fileId, `u/${ownerId}/${fileId}/${versionId}`, size, ownerId, now],
  );
  return { fileId, versionId };
};
