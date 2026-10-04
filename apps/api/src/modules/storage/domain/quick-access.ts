import type { FileKind } from './file-kind';
import type { StorageNode } from './storage-node';

/**
 * Accesos rápidos de la barra lateral (spec 006 CA-27 y CA-28, plan §9.2; DF-63). Modelo de lectura: la fila de
 * `acceso_rapido` es de la cuenta que fija o abre, no del dueño del nodo.
 */

/** Carpeta o archivo de la barra lateral; `kind` (solo archivos) elige el ícono. */
export interface QuickAccessItem {
  readonly type: StorageNode['type'];
  readonly id: string;
  readonly name: string;
  readonly kind?: FileKind;
}

/** Fijados por fecha de fijado y recientes (sin los fijados) por apertura, del más nuevo al más viejo. */
export interface QuickAccessList {
  readonly pinned: readonly QuickAccessItem[];
  readonly recent: readonly QuickAccessItem[];
  /** Hay más recientes que los visibles: la barra muestra «Ver más». */
  readonly hasMoreRecent: boolean;
}
