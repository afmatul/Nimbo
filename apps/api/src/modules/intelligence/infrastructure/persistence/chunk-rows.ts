import type {
  ChunkLocationJson,
  StoredChunk,
} from '../../application/ports/i-chunk-repository.port';

/** Columnas de `fragmento` (alias `f`) que se leen, sin el vector; las comparten el repositorio y la búsqueda. */
export const CHUNK_COLUMNS =
  'f.id, f.archivo_id, f.version_archivo_id, f.orden, f.texto, f.procedencia';

/** Fila de `CHUNK_COLUMNS`. */
export interface ChunkRow {
  readonly id: string;
  readonly archivo_id: string;
  readonly version_archivo_id: string;
  readonly orden: number;
  readonly texto: string;
  readonly procedencia: ChunkLocationJson;
}

export const toStoredChunk = (row: ChunkRow): StoredChunk => ({
  id: row.id,
  fileId: row.archivo_id,
  versionId: row.version_archivo_id,
  order: row.orden,
  text: row.texto,
  location: row.procedencia,
});

/** Forma de texto de pgvector: `[x,y,…]`. */
export const toVectorLiteral = (vector: readonly number[]): string => `[${vector.join(',')}]`;
