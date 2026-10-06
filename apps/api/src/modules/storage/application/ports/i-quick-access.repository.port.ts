import type { Actor } from '../../../../shared';
import type { QuickAccessItem } from '../../domain/quick-access';
import type { StorageNode } from '../../domain/storage-node';

/** Un nodo de los accesos rápidos por tipo e id (lo que se fija, se quita o se abre). */
export interface QuickAccessNodeRef {
  readonly type: StorageNode['type'];
  readonly id: string;
}

/** Nodo vivo que el actor ve, con su estado en los accesos rápidos del actor. */
export interface QuickAccessNode {
  readonly item: QuickAccessItem;
  readonly pinned: boolean;
}

/** Cuántas filas pedir de cada grupo del listado. */
export interface QuickAccessTake {
  readonly pinned: number;
  readonly recent: number;
}

/** Fijados por `fijado_en DESC` y recientes no fijados por `abierto_en DESC`, solo de nodos que el actor ve. */
export interface QuickAccessRows {
  readonly pinned: readonly QuickAccessItem[];
  readonly recent: readonly QuickAccessItem[];
}

/**
 * Accesos rápidos del actor (plan 006 §9.2): filas de `acceso_rapido` de la cuenta que fija o abre. Toda lectura y toda
 * escritura sobre un nodo une `accessibleNodes(actor)` en la consulta (lo que está en la papelera no se ve ni ocupa
 * tope) y todo método toma el `EntityManager` de `requireActorScope(actor)`. Solo `pin` de `QuickAccessService` toma
 * antes `IQuotaRepository.lockUsage(actor)`.
 */
export interface IQuickAccessRepository {
  list(actor: Actor, take: QuickAccessTake): Promise<QuickAccessRows>;
  /** Fijados del actor cuyos nodos sigue viendo vivos (CA-28). */
  countPinned(actor: Actor): Promise<number>;
  /** El nodo vivo que el actor ve; `null` si no existe, es ajeno o está en la papelera (CA-22). */
  findAccessibleNode(actor: Actor, ref: QuickAccessNodeRef): Promise<QuickAccessNode | null>;
  /** Marca el nodo como fijado en `at`; si ya lo estaba, conserva su `fijado_en` (orden). */
  upsertPin(actor: Actor, ref: QuickAccessNodeRef, at: Date): Promise<void>;
  /** Quita el fijado: si el nodo se abrió alguna vez queda como reciente; si no, la fila se borra (`ck_acceso_util`). */
  removePin(actor: Actor, ref: QuickAccessNodeRef, at: Date): Promise<void>;
  /** Registra la apertura en `at` (crea la fila o actualiza `abierto_en`); un fijado sigue fijado. */
  touchRecent(actor: Actor, ref: QuickAccessNodeRef, at: Date): Promise<void>;
  /** Conserva los `keep` recientes no fijados más nuevos de la cuenta y borra el resto. */
  pruneRecents(actor: Actor, keep: number): Promise<void>;
}

export const I_QUICK_ACCESS_REPOSITORY = Symbol('IQuickAccessRepository');
