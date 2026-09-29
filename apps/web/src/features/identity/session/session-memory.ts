import type { SessionResponse } from '@nimbo/contracts';

/**
 * La sesión vive solo en la memoria de la pestaña (D-1, CA-28): nunca en `localStorage`, `sessionStorage` ni cookies
 * legibles. Este módulo la entrega del inicio de sesión (grupo `(public)`) al `SessionProvider` del grupo `(app)` en la
 * navegación del cliente; una recarga la pierde y el proveedor la recupera con la cookie de refresco.
 */
let current: SessionResponse | null = null;

export function rememberSession(session: SessionResponse): void {
  current = session;
}

/** La sesión recordada si su token de acceso no venció; si venció, la olvida. */
export function recallSession(now: number): SessionResponse | null {
  if (current !== null && Date.parse(current.accessTokenExpiresAt) <= now) current = null;
  return current;
}

export function forgetSession(): void {
  current = null;
}
