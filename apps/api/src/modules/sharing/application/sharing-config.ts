import type { LockoutPolicy } from '../../../shared';

/** Configuración de `sharing` tomada del entorno validado (planes 012 y 013 §2). La enlaza `SharingModule`. */
export interface SharingConfig {
  /**
   * `SHARING_RATE_LIMIT_PER_MINUTE`: intentos por propietario en una ventana de 60 s, de compartir (012 CA-7) y, con su
   * propia clave, de generar enlaces públicos (013 CA-6, S-8).
   */
  readonly shareAttemptsPerMinute: number;
  /** `WEB_PUBLIC_URL`: base de la URL del enlace público que se entrega al generarlo (013 CA-1). */
  readonly webPublicUrl: string;
  /**
   * `PUBLIC_LINK_RATE_LIMIT_PER_MINUTE`: peticiones por red (`limitNetworkOf`) en una ventana de 60 s a las rutas del
   * visitante, antes de resolver el token (013 CA-13, plan §5).
   */
  readonly publicLinkRequestsPerMinute: number;
  /**
   * `PUBLIC_LINK_MAX_FAILURES`, `PUBLIC_LINK_FAILURE_WINDOW_MINUTES` y `PUBLIC_LINK_LOCK_MINUTES` en segundos: el
   * bloqueo por contraseñas fallidas de un enlace desde una red (013 CA-13, RN-7, S-1).
   */
  readonly publicLinkLockout: LockoutPolicy;
  /**
   * `PUBLIC_LINK_GLOBAL_MAX_FAILURES_PER_HOUR` con ventana y espera fijas de 60 minutos: el techo global de contraseñas
   * fallidas de un enlace, sumando todas las redes (013b CA-12, RN-3, S-2; PD-175).
   */
  readonly publicLinkCeiling: LockoutPolicy;
}

export const SHARING_CONFIG: unique symbol = Symbol('SharingConfig');
