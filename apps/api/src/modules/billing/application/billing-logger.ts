/**
 * Lo mínimo que `billing` necesita del logger (se inyecta `PinoLogger`; permite un doble en las pruebas). Solo UUID,
 * conteos y motivos: nunca tarjeta, CVC, NIT ni correo (spec 009 §5).
 */
export interface BillingLogger {
  info(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
}
