import type { Actor } from '../../../../shared';

/** Extracto que se guarda de una versión (`miniatura`). */
export interface NewThumbnail {
  readonly id: string;
  readonly fileId: string;
  readonly versionId: string;
  readonly text: string;
  readonly createdAt: Date;
}

/**
 * Extracto de texto por versión de `.docx` (`miniatura`). Todo método usa el `EntityManager` de
 * `requireActorScope(actor)`: la RLS (solo `CLIENT`, solo archivos de su propiedad) es la segunda barrera; quien
 * llama actúa como la propietaria. Los que escriben exigen la transacción `withActor` del llamador.
 */
export interface IThumbnailRepository {
  /** Texto de la versión `versionId`; `null` si todavía no se generó. */
  findText(actor: Actor, versionId: string): Promise<string | null>;
  /** Guarda el extracto; si la versión ya tiene uno (dos peticiones a la vez) no hace nada ni aborta la transacción. */
  insertIfAbsent(actor: Actor, thumbnail: NewThumbnail): Promise<void>;
}

export const I_THUMBNAIL_REPOSITORY = Symbol('IThumbnailRepository');
