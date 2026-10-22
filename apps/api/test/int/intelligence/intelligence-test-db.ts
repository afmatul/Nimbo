import { randomUUID } from 'node:crypto';

import type { Queryable } from '../storage/storage-test-db';

/** Dimensión de `fragmento.embedding` (plan 019 §3). */
export const EMBEDDING_DIMENSIONS = 768;

/** Archivo y versión de una fila de *fixture* de `indexacion` o `fragmento`. */
export interface IndexedVersionRow {
  readonly fileId: string;
  readonly versionId: string;
}

/**
 * Estado y motivo de una `indexacion` de *fixture*; por defecto, `pendiente`. Texto libre: las pruebas de esquema
 * insertan también valores que el `CHECK` debe rechazar.
 */
export interface IndexingRowOptions {
  readonly state?: string;
  readonly reason?: string | null;
  readonly updatedAt?: Date;
}

/** Vector unitario en el eje `axis`: dos ejes distintos son ortogonales (distancia coseno 1). */
export const axisVector = (axis: number): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_value, index) => (index === axis ? 1 : 0));

/** Forma de texto de pgvector (`[x,y,…]`) para un parámetro `::vector`. */
export const toVectorLiteral = (vector: readonly number[]): string => `[${vector.join(',')}]`;

/** Inserta una `indexacion` sobre `version` y devuelve su id (como el dueño o dentro de `withActor`). */
export const insertIndexing = async (
  runner: Queryable,
  version: IndexedVersionRow,
  options: IndexingRowOptions = {},
): Promise<string> => {
  const id = randomUUID();
  const updatedAt = options.updatedAt ?? new Date();
  await runner.query(
    `INSERT INTO indexacion (id, archivo_id, version_archivo_id, estado, motivo, creado_en, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    [
      id,
      version.fileId,
      version.versionId,
      options.state ?? 'pendiente',
      options.reason ?? null,
      updatedAt,
    ],
  );
  return id;
};

/** Fragmento de *fixture*: orden, texto, procedencia y eje de su vector. */
export interface ChunkRowOptions {
  readonly order?: number;
  readonly text?: string;
  readonly location?: unknown;
  readonly axis?: number;
}

/** Inserta un `fragmento` sobre `version` y devuelve su id. */
export const insertChunk = async (
  runner: Queryable,
  version: IndexedVersionRow,
  options: ChunkRowOptions = {},
): Promise<string> => {
  const id = randomUUID();
  await runner.query(
    `INSERT INTO fragmento (id, archivo_id, version_archivo_id, orden, texto, procedencia, embedding, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, now())`,
    [
      id,
      version.fileId,
      version.versionId,
      options.order ?? 0,
      options.text ?? 'Informe trimestral de ventas',
      JSON.stringify(options.location ?? { tipo: 'pdf', pagina: 1, confianza: 1 }),
      toVectorLiteral(axisVector(options.axis ?? 0)),
    ],
  );
  return id;
};

/** Filas de `table` (como quien llama); `where` opcional sobre `archivo_id`. */
export const countRows = async (
  runner: Queryable,
  table: 'indexacion' | 'fragmento',
  fileId?: string,
): Promise<number> => {
  const filter = fileId === undefined ? '' : ' WHERE archivo_id = $1';
  const [row] = (await runner.query(
    `SELECT count(*)::int AS n FROM ${table}${filter}`,
    fileId === undefined ? [] : [fileId],
  )) as { n: number }[];
  return row?.n ?? 0;
};
