import { StorageTooManyRequestsError } from '../domain/errors';

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

/** Operación limitada por tasa (RN-16), tal como la nombra la bitácora `upload.rate_limited`. */
export type RateLimitedOperation = 'upload_init' | 'download_url';

/** Anota el 429 en la bitácora (plan §7) y devuelve el error que el servicio lanza. */
export function rateLimited(
  logger: StorageLogger,
  operation: RateLimitedOperation,
  retryAfterSeconds: number,
): StorageTooManyRequestsError {
  logger.warn({ event: 'upload.rate_limited', operation });
  return new StorageTooManyRequestsError(retryAfterSeconds);
}
