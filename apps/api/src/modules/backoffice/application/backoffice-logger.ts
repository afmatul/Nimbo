/**
 * Lo mínimo que los servicios de `backoffice` necesitan del logger (se inyecta `PinoLogger`; permite un doble en las
 * pruebas). Solo ids, roles y conteos: nunca correo, nombre, código de empleado, nombre de archivo ni token (RNF-17).
 */
export interface BackofficeLogger {
  info(payload: Record<string, unknown>): void;
  warn(payload: Record<string, unknown>): void;
}
