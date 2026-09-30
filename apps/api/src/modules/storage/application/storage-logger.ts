/**
 * Lo mínimo que los servicios de `storage` necesitan del logger (se inyecta `PinoLogger`; permite un doble en las
 * pruebas). Solo UUID, tamaños, modos y motivos: nunca nombre de archivo, URL firmada, clave de objeto ni el
 * `upload_id` de S3 (CA-20).
 */
export interface StorageLogger {
  info(payload: Record<string, unknown>): void;
  warn(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
}
