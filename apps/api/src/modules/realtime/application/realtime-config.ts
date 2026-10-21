/** Una conexión que se cae sin cerrar se da por salida en este plazo como máximo (RN-9, CA-9). */
export const DEPARTURE_DETECTION_LIMIT_MS = 60_000;

/** Latido por defecto (plan §4): una caída sin cierre se detecta en ≤ 35 s, dentro de `DEPARTURE_DETECTION_LIMIT_MS`. */
export const REALTIME_PING_INTERVAL_MS = 20_000;
export const REALTIME_PING_TIMEOUT_MS = 15_000;

/**
 * Configuración técnica del canal, tomada del entorno validado (plan §2). Las pruebas de integración la sustituyen con
 * tiempos de latido cortos.
 */
export interface RealtimeConfig {
  /** `CORS_ORIGIN`: únicos orígenes de navegador admitidos (RN-3). */
  readonly origins: readonly string[];
  /** `REALTIME_CONNECT_ATTEMPTS_PER_MINUTE`: intentos de conexión por origen y minuto (CA-14). */
  readonly connectAttemptsPerMinute: number;
  readonly pingIntervalMs: number;
  readonly pingTimeoutMs: number;
}

export const REALTIME_CONFIG = Symbol('REALTIME_CONFIG');
