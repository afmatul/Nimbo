/** Configuración de `VersionRestoreService` tomada del entorno validado (plan 014 §5). La enlaza `StorageModule`. */
export interface VersionRestoreConfig {
  /** `RATE_LIMIT_VERSION_RESTORE_PER_MINUTE`: restauraciones por actor en una ventana de 60 s. */
  readonly restorePerMinute: number;
}

export const VERSION_RESTORE_CONFIG: unique symbol = Symbol('VersionRestoreConfig');
