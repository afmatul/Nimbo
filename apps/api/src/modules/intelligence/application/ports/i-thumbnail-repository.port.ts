import type { Actor } from '../../../../shared';

/** Extracto que se guarda de una versión (`miniatura`). */
export interface NewThumbnail {
  readonly id: string;
  readonly fileId: string;
  readonly versionId: string;
  /** `null`: sin texto o ilegible; se guarda igual para no leer el archivo otra vez. */
  readonly text: string | null;
  readonly createdAt: Date;
}

/**
 * Extracto de texto por versión de `.docx` (`miniatura`). Todo método usa el `EntityManager` de
 * `requireActorScope(actor)`: la RLS (solo `CLIENT`, solo archivos de su propiedad) es la segunda barrera; quien
 * llama actúa como la propietaria. Los que escriben exigen la transacción `withActor` del llamador.
 */
export interface IThumbnailRepository {
  /** El resultado guardado de la versión `versionId`; `null` si todavía no se generó (`{ text: null }`: ya se intentó). */
  find(actor: Actor, versionId: string): Promise<{ readonly text: string | null } | null>;
  /** Guarda el extracto; si la versión ya tiene uno (dos peticiones a la vez) no hace nada ni aborta la transacción. */
  insertIfAbsent(actor: Actor, thumbnail: NewThumbnail): Promise<void>;
}

export const I_THUMBNAIL_REPOSITORY = Symbol('IThumbnailRepository');
