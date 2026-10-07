import type { Actor } from '../../../../shared';
import type { FileKind } from '../../domain/file-kind';

/**
 * Espacio de los archivos vivos del actor (spec 007, plan §2). Una lectura agregada que no necesitan los consumidores de
 * `INodeRepository` (ISP). Toma el `EntityManager` de `TransactionContext.requireActorScope(actor)`: se llama dentro de
 * `ITransactionRunner.withActor(actor, …)`.
 */
export interface ISpaceRepository {
  /**
   * Suma de las versiones de los archivos vivos **propios** del actor, por tipo (D-3). Los tipos sin archivos no
   * aparecen. Lo de la papelera no entra: eso es `ITrashRepository.trashSummary`.
   */
  liveBytesByKind(actor: Actor): Promise<ReadonlyMap<FileKind, bigint>>;
}

export const I_SPACE_REPOSITORY = Symbol('ISpaceRepository');
