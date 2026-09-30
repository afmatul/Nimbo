/**
 * Configuración técnica de la carga (plan §5), tomada del entorno validado. Solo técnica: los límites de negocio
 * (máximo por archivo y cuota) salen de `IPlanLimitsProvider` (RN-1).
 */
export interface UploadConfig {
  /** `UPLOAD_PART_SIZE_BYTES`: tamaño de cada parte salvo la última. */
  readonly partSizeBytes: bigint;
  /** `UPLOAD_MULTIPART_THRESHOLD_BYTES`: por encima de este tamaño la carga es por partes (RN-2). */
  readonly multipartThresholdBytes: bigint;
  /** `UPLOAD_URL_TTL_SECONDS`: vigencia de las URLs de carga; `resume` las renueva. */
  readonly urlTtlSeconds: number;
  /** `RATE_LIMIT_UPLOAD_INIT_PER_MINUTE`: inicios de carga por actor y minuto (RN-16). */
  readonly initPerMinute: number;
}

export const UPLOAD_CONFIG = Symbol('UPLOAD_CONFIG');
