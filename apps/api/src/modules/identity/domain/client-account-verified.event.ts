/** Nombre del evento en proceso que se emite tras confirmar la verificación del correo (ADR-0019, CA-8). */
export const CLIENT_ACCOUNT_VERIFIED = 'identity.client-account-verified';

/** Carga del evento: solo el id de la cuenta, sin correo ni nombre (CA-8). `billing` (006a) lo consume. */
export interface ClientAccountVerifiedEvent {
  readonly userId: string;
}
