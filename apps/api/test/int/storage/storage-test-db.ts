import { randomUUID } from 'node:crypto';

import { LEGAL_DOCUMENTS } from '@nimbo/contracts';
import type { DataSource, EntityManager, QueryRunner } from 'typeorm';

import type { Actor } from '../../../src/shared';
import { Role } from '../../../src/shared';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { connectTo, requiredEnv } from '../../support/database-urls';
import { employeeCodeFor } from '../../support/employee-codes';

/** Lo único que las *fixtures* necesitan: un `QueryRunner` del dueño o el `EntityManager` de `withActor`. */
export interface Queryable {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

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

/** Inserta una cuenta (como el dueño: `usuario` es un *fixture* aquí) y devuelve su id. Las internas llevan código. */
export const insertAccount = async (
  runner: Queryable,
  role: Role = Role.CLIENT,
): Promise<string> => {
  const id = randomUUID();
  const isClient = role === Role.CLIENT;
  await runner.query(
    `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, correo_verificado, version_terminos,
                          version_privacidad, terminos_aceptados_en, codigo_empleado)
     VALUES ($1, 'Ana López', $2, $3, $4, true, $5, $6, $7, $8)`,
    [
      id,
      `storage.${id}@ejemplo.com`,
      PLACEHOLDER_PHC,
      role,
      isClient ? LEGAL_DOCUMENTS.terms.version : null,
      isClient ? LEGAL_DOCUMENTS.privacy.version : null,
      isClient ? ACCEPTED_AT : null,
      employeeCodeFor(role),
    ],
  );
  return id;
};

/** Filas de `information_schema.columns` de una tabla, por nombre de columna. */
export const columnsOf = async (
  runner: Queryable,
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
  /** En la papelera; la fecha de purga (`ck_archivo_papelera`) es `purgeAt` o, si falta, la misma. */
  readonly deletedAt?: Date | null;
  readonly purgeAt?: Date;
  readonly folderId?: string | null;
  readonly trashedWithFolderId?: string | null;
}

/**
 * Inserta `archivo` y su `version_archivo` en la misma transacción (la FK `version_actual_id` es diferida) y devuelve
 * ambos ids. La clave de objeto sigue el formato `u/{propietario}/{archivo}/{version}`.
 */
export const insertFileWithVersion = async (
  runner: Queryable,
  ownerId: string,
  options: FileRowOptions = {},
): Promise<{ fileId: string; versionId: string }> => {
  const fileId = randomUUID();
  const versionId = randomUUID();
  const size = String(options.sizeBytes ?? 1024n);
  const now = new Date();
  const deletedAt = options.deletedAt ?? null;
  await runner.query(
    `INSERT INTO archivo (id, propietario_id, nombre, tipo, tamano_bytes, version_actual_id, creado_en,
                          actualizado_en, eliminado_en, purgar_en, carpeta_id, eliminado_con_carpeta_id)
     VALUES ($1, $2, $3, 'pdf', $4, $5, $6, $6, $7, $8, $9, $10)`,
    [
      fileId,
      ownerId,
      options.name ?? `informe-${fileId}.pdf`,
      size,
      versionId,
      now,
      deletedAt,
      deletedAt === null ? null : (options.purgeAt ?? deletedAt),
      options.folderId ?? null,
      options.trashedWithFolderId ?? null,
    ],
  );
  await runner.query(
    `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en)
     VALUES ($1, $2, 'carga', $3, $4, $5, $6)`,
    [versionId, fileId, `u/${ownerId}/${fileId}/${versionId}`, size, ownerId, now],
  );
  return { fileId, versionId };
};

export interface FolderRowOptions {
  readonly name?: string;
  /** Carpeta padre ya insertada; sin ella, la carpeta va en la raíz. */
  readonly parent?: { readonly id: string; readonly path: string; readonly depth: number } | null;
  readonly deletedAt?: Date | null;
  readonly purgeAt?: Date;
  readonly trashedWithFolderId?: string | null;
}

export interface FolderRow {
  readonly id: string;
  readonly path: string;
  readonly depth: number;
}

/** Inserta una `carpeta` con su `ruta` (`/<id>/…/<id>/`) y `profundidad` derivadas del padre; devuelve las tres. */
export const insertFolder = async (
  runner: Queryable,
  ownerId: string,
  options: FolderRowOptions = {},
): Promise<FolderRow> => {
  const id = randomUUID();
  const parent = options.parent ?? null;
  const folder = { id, path: `${parent?.path ?? '/'}${id}/`, depth: (parent?.depth ?? 0) + 1 };
  const deletedAt = options.deletedAt ?? null;
  const now = new Date();
  await runner.query(
    `INSERT INTO carpeta (id, propietario_id, carpeta_padre_id, nombre, ruta, profundidad, creado_en, actualizado_en,
                          eliminado_en, purgar_en, eliminado_con_carpeta_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10)`,
    [
      id,
      ownerId,
      parent?.id ?? null,
      options.name ?? `carpeta-${id}`,
      folder.path,
      folder.depth,
      now,
      deletedAt,
      deletedAt === null ? null : (options.purgeAt ?? deletedAt),
      options.trashedWithFolderId ?? null,
    ],
  );
  return folder;
};

/** Nodo de un acceso rápido: exactamente uno de los dos (`ck_acceso_un_nodo`). */
export type QuickAccessNode = { readonly fileId: string } | { readonly folderId: string };

export interface QuickAccessRowOptions {
  readonly pinnedAt?: Date | null;
  readonly openedAt?: Date | null;
}

/** Inserta una fila de `acceso_rapido` de `userId` sobre `node`; por defecto, fijada ahora y nunca abierta. */
export const insertQuickAccess = async (
  runner: Queryable,
  userId: string,
  node: QuickAccessNode,
  options: QuickAccessRowOptions = {},
): Promise<string> => {
  const id = randomUUID();
  const now = new Date();
  await runner.query(
    `INSERT INTO acceso_rapido (id, usuario_id, archivo_id, carpeta_id, fijado_en, abierto_en, creado_en,
                                actualizado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [
      id,
      userId,
      'fileId' in node ? node.fileId : null,
      'folderId' in node ? node.folderId : null,
      options.pinnedAt === undefined ? now : options.pinnedAt,
      options.openedAt ?? null,
      now,
    ],
  );
  return id;
};

export interface UploadRowOptions {
  readonly mode?: 'simple' | 'por_partes';
  readonly state?: 'activa' | 'completada' | 'rechazada' | 'cancelada' | 'expirada';
  readonly rejection?: 'tamano' | 'tipo_invalido' | null;
  readonly sizeBytes?: bigint;
  readonly expiresAt?: Date;
  /** Por defecto, coherente con `mode` (`ck_carga_partes`); se fuerza para probar la restricción. */
  readonly multipart?: { uploadId: string; totalParts: number; partSizeBytes: bigint } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inserta una fila `carga` (la reserva de cuota) con ids reservados de archivo y versión; devuelve su id. */
export const insertUpload = async (
  runner: Queryable,
  ownerId: string,
  options: UploadRowOptions = {},
): Promise<string> => {
  const id = randomUUID();
  const fileId = randomUUID();
  const versionId = randomUUID();
  const mode = options.mode ?? 'simple';
  const multipart =
    options.multipart === undefined
      ? mode === 'por_partes'
        ? { uploadId: `upload-${id}`, totalParts: 2, partSizeBytes: 8_388_608n }
        : null
      : options.multipart;
  const now = new Date();
  await runner.query(
    `INSERT INTO carga (id, propietario_id, nombre, tamano_bytes, modo, estado, motivo_rechazo, archivo_id,
                        version_id, clave_objeto, upload_id, partes_totales, tamano_parte_bytes, expira_en,
                        creada_en, actualizada_en)
     VALUES ($1, $2, 'informe.pdf', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)`,
    [
      id,
      ownerId,
      String(options.sizeBytes ?? 1024n),
      mode,
      options.state ?? 'activa',
      options.rejection ?? null,
      fileId,
      versionId,
      `u/${ownerId}/${fileId}/${versionId}`,
      multipart?.uploadId ?? null,
      multipart?.totalParts ?? null,
      multipart === null ? null : String(multipart.partSizeBytes),
      options.expiresAt ?? new Date(now.getTime() + DAY_MS),
      now,
    ],
  );
  return id;
};

/** Conexión como `nimbo_app` con el ejecutor real de `withActor` (003): lo que ven los repositorios de 005. */
export interface AppDatabase {
  readonly dataSource: DataSource;
  readonly context: TransactionContext;
  readonly runner: TypeOrmTransactionRunner;
  /** Corre `work` dentro de `withActor(actor)` con el `EntityManager` de ese ámbito. */
  asActor<T>(actor: Actor, work: (manager: EntityManager) => Promise<T>): Promise<T>;
}

export const connectAsAppDatabase = async (): Promise<AppDatabase> => {
  const dataSource = await connectTo(requiredEnv('DATABASE_URL'));
  const context = new TransactionContext(dataSource);
  const runner = new TypeOrmTransactionRunner(dataSource, context);
  return {
    dataSource,
    context,
    runner,
    asActor: (actor, work) => runner.withActor(actor, () => work(context.requireActorScope(actor))),
  };
};

/**
 * Borra (como el dueño) los accesos rápidos, cargas, archivos, carpetas y cuentas de una suite que confirmó *fixtures*.
 * `acceso_rapido` va primero: su `usuario_id` no se borra en cascada (con 012 puede señalar un nodo ajeno).
 */
export const removeAccounts = async (
  owner: DataSource,
  accountIds: readonly string[],
): Promise<void> => {
  if (accountIds.length === 0) return;
  await owner.transaction(async (manager) => {
    await manager.query('DELETE FROM acceso_rapido WHERE usuario_id = ANY($1)', [accountIds]);
    await manager.query('DELETE FROM carga WHERE propietario_id = ANY($1)', [accountIds]);
    await manager.query('DELETE FROM archivo WHERE propietario_id = ANY($1)', [accountIds]);
    await manager.query('DELETE FROM carpeta WHERE propietario_id = ANY($1)', [accountIds]);
    await manager.query('DELETE FROM usuario WHERE id = ANY($1)', [accountIds]);
  });
};
