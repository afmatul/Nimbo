import type { Actor } from '../../../../shared';

/**
 * Procedencia de un fragmento tal como se guarda en `fragmento.procedencia` (DF-07): la forma de
 * `SourceLocation.toJson()`, p. ej. `{ tipo: 'pdf', pagina: 3, confianza: 1 }`. El repositorio no la interpreta.
 */
export type ChunkLocationJson = Readonly<{ tipo: string } & Record<string, string | number>>;

/** Versión de archivo dueña de los fragmentos. */
export interface ChunkVersion {
  readonly fileId: string;
  readonly versionId: string;
}

/** Fragmento por guardar: posición en la versión, texto, procedencia y vector de 768 dimensiones. */
export interface ChunkToStore {
  readonly order: number;
  readonly text: string;
  readonly location: ChunkLocationJson;
  readonly embedding: readonly number[];
}

/** Fragmento guardado, sin su vector. */
export interface StoredChunk extends ChunkVersion {
  readonly id: string;
  readonly order: number;
  readonly text: string;
  readonly location: ChunkLocationJson;
}

/**
 * Fragmentos indexados (`fragmento`, plan 019 §2; `IChunkRepository` de M6): la escritura del `worker` y la lectura por
 * archivo. Todo método toma el `EntityManager` de `requireActorScope(actor)`. La lectura restringe a
 * `accessibleNodes(actor)` **dentro de la consulta** (DF-14, CA-17): un archivo ajeno o en la papelera no aparece; la
 * RLS es la segunda barrera. La búsqueda del agente es de `IChunkSearch` (plan 020 D-2, que retiró `nearest`).
 */
export interface IChunkRepository {
  /**
   * Deja en el archivo solo los fragmentos `chunks` de `version` (RN-1, CA-10): borra los de toda versión del archivo,
   * incluida esta (reprocesar es idempotente, CA-9), e inserta los nuevos. Atómico dentro de la transacción
   * `withActor` del llamador.
   */
  replaceForVersion(
    actor: Actor,
    version: ChunkVersion,
    chunks: readonly ChunkToStore[],
  ): Promise<void>;
  /** Fragmentos del archivo por orden; vacío si el actor no lo ve vivo. */
  findByFile(actor: Actor, fileId: string): Promise<readonly StoredChunk[]>;
}

export const I_CHUNK_REPOSITORY = Symbol('IChunkRepository');
