import { saveExpiring, takeExpiring } from './expiring-storage';

/**
 * Correo con el que 002 prellena «Pedir un enlace nuevo». No viaja en la URL, para que no quede en bitácoras de Next
 * ni de Traefik, y vence a las 24 h como el plan elegido (SEC-2).
 */
export const REQUEST_LINK_EMAIL_KEY = 'nimbo.registro.correo';
const FIELDS = ['email'] as const;

/** Guarda el correo para prellenar pedir-enlace (lo usa 002 al responder `IDENTITY_EMAIL_NOT_VERIFIED`). */
export function saveRequestLinkEmail(storage: Storage | undefined, email: string, now: Date): void {
  saveExpiring(storage, REQUEST_LINK_EMAIL_KEY, { email }, now);
}

/** Lee y borra el correo si tiene menos de 24 h; si no, cadena vacía. */
export function takeRequestLinkEmail(storage: Storage | undefined, now: Date): string {
  return takeExpiring(storage, REQUEST_LINK_EMAIL_KEY, FIELDS, now)?.email ?? '';
}
