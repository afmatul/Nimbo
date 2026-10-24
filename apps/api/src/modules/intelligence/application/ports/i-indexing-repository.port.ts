import type { Actor } from '../../../../shared';
import type { FileIndexing, IndexingState } from '../../domain/file-indexing';

/**
 * Estado de indexación por versión (`indexacion`, plan 019 §2). Todo método toma el `EntityManager` de
 * `requireActorScope(actor)`: la RLS de la tabla (solo `CLIENT` y solo archivos que `archivo` le deja ver) es la
 * segunda barrera. Los que escriben exigen la transacción `withActor` del llamador.
 */
export interface IIndexingRepository {
  /** La indexación de la versión `versionId`; `null` si no hay fila o el actor no ve el archivo. */
  findByVersion(actor: Actor, versionId: string): Promise<FileIndexing | null>;
  /**
   * Inserta la indexación si su versión no tiene otra (`uq_indexacion_version`): `false` si ya existía, sin abortar la
   * transacción. Un evento repetido no crea una segunda fila (CA-9, RN-10).
   */
  insertIfAbsent(actor: Actor, indexing: FileIndexing): Promise<boolean>;
  /**
   * Guarda estado, motivo, intentos, fragmentos, duración y fecha de `indexing` solo si en la BD sigue en `expected`
   * (comparar y asignar, plan §7 punto 8): dos trabajos o un «Reintentar» simultáneo no hacen la misma transición dos
   * veces. `false` si otro llegó antes.
   */
  compareAndSet(actor: Actor, indexing: FileIndexing, expected: IndexingState): Promise<boolean>;
  /** Borra las filas de las demás versiones del archivo de `current` (RN-1, CA-10); devuelve cuántas borró. */
  deleteOtherVersions(actor: Actor, current: FileIndexing): Promise<number>;
}

export const I_INDEXING_REPOSITORY = Symbol('IIndexingRepository');
