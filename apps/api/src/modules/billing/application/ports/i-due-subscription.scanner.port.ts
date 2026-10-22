/**
 * Único acceso a `suscripcion` sin actor (spec 010 plan §2; ADR-0021), como `IPendingInvoiceScanner`: llama a las dos
 * funciones de la pasada dentro de `ITransactionRunner.run` y devuelve solo los ids de los dueños. Interno de `billing`.
 */
export interface IDueSubscriptionScanner {
  /** Vencidas por renovar (o en solo lectura sin su correo de vencida, M-3), de la más antigua a la más nueva. */
  listDueForRenewal(limit: number): Promise<readonly string[]>;
  /** Vigentes que vencen dentro de `days` días sin su aviso previo (CA-5, RN-8). */
  listDueForReminder(days: number, limit: number): Promise<readonly string[]>;
}

export const I_DUE_SUBSCRIPTION_SCANNER = Symbol('IDueSubscriptionScanner');
