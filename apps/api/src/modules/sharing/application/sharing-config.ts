/** Configuración de `sharing` tomada del entorno validado (planes 012 y 013 §2). La enlaza `SharingModule`. */
export interface SharingConfig {
  /**
   * `SHARING_RATE_LIMIT_PER_MINUTE`: intentos por propietario en una ventana de 60 s, de compartir (012 CA-7) y, con su
   * propia clave, de generar enlaces públicos (013 CA-6, S-8).
   */
  readonly shareAttemptsPerMinute: number;
  /** `WEB_PUBLIC_URL`: base de la URL del enlace público que se entrega al generarlo (013 CA-1). */
  readonly webPublicUrl: string;
}

export const SHARING_CONFIG: unique symbol = Symbol('SharingConfig');
