/**
 * Configuración de los accesos rápidos tomada del entorno validado (plan 006 §9.2). La enlaza `StorageModule` desde
 * `QUICK_ACCESS_MAX_PINNED` y `QUICK_ACCESS_RECENT_VISIBLE`.
 */
export interface QuickAccessConfig {
  /** `QUICK_ACCESS_MAX_PINNED`: fijados visibles por cuenta (CA-28). */
  readonly maxPinned: number;
  /** `QUICK_ACCESS_RECENT_VISIBLE`: recientes que muestra la barra antes de «Ver más» (CA-27). */
  readonly recentVisible: number;
}

export const QUICK_ACCESS_CONFIG: unique symbol = Symbol('QuickAccessConfig');

/**
 * Recientes no fijados que se conservan por cuenta tras cada apertura: colchón para que los nodos en la papelera no
 * vacíen la lista. Constante con nombre, no configuración: ninguna spec pide ajustarla (YAGNI).
 */
export const RECENTS_STORED = 25;
