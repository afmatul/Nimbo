/** Nombre del evento en proceso que se emite tras confirmar la verificación del correo (ADR-0019, CA-8). */
export const CLIENT_ACCOUNT_VERIFIED = 'identity.client-account-verified';

/**
 * Carga del evento: el id de la cuenta y el plan elegido al registrarse, sin correo ni nombre (CA-8). `billing` (006a)
 * lo consume: da de alta Personal y descarta el plan pendiente si es gratuito o no existe.
 */
export interface ClientAccountVerifiedEvent {
  readonly userId: string;
  readonly pendingPlanSlug: string | null;
}
