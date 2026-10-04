/**
 * Configuración de carpetas tomada del entorno validado (plan 006 §7, decisión 2). La enlaza `StorageModule` desde
 * `FOLDER_MAX_DEPTH`; la profundidad máxima es configuración, no regla del plan de suscripción.
 */
export interface FolderConfig {
  /** `FOLDER_MAX_DEPTH`: niveles máximos del árbol al crear, mover o restaurar (CA-9, CA-15). */
  readonly maxDepth: number;
}

export const FOLDER_CONFIG: unique symbol = Symbol('FolderConfig');
