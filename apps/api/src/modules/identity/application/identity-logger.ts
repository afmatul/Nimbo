/**
 * Lo mínimo que los servicios de `identity` necesitan del logger (se inyecta `PinoLogger`; permite un doble en las
 * pruebas). Solo eventos con `userId`: nunca correo, nombre, token, hash ni URL (plan §7, CA-18).
 */
export interface IdentityLogger {
  info(payload: Record<string, unknown>): void;
  warn(payload: Record<string, unknown>): void;
}
