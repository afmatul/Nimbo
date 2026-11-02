/** Configuración de `SharingService` tomada del entorno validado (plan 012 §2). La enlaza `SharingModule`. */
export interface SharingConfig {
  /** `SHARING_RATE_LIMIT_PER_MINUTE`: intentos de compartir por propietario en una ventana de 60 s (CA-7). */
  readonly shareAttemptsPerMinute: number;
}

export const SHARING_CONFIG: unique symbol = Symbol('SharingConfig');
