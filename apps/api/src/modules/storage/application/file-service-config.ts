/** Configuración de `FileService` tomada del entorno validado (plan §5, D-3). La enlaza `StorageModule` (T-42). */
export interface FileServiceConfig {
  /** `RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE`: URLs de descarga por actor en una ventana de 60 s (RN-16). */
  readonly downloadUrlPerMinute: number;
}

export const FILE_SERVICE_CONFIG: unique symbol = Symbol('FileServiceConfig');
