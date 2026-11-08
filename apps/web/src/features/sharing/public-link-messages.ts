import { SHARED_ERROR_CODES, SHARING_ERROR_CODES } from '@nimbo/contracts';

import { minutesFrom } from '../../lib/error-catalog';

/** La red o un 5xx no traen un `code` propio: la página distingue si pasó al abrir o al descargar (CA-7). */
export const PUBLIC_LINK_OPEN_FAILED = 'PUBLIC_LINK_OPEN_FAILED';
export const PUBLIC_LINK_DOWNLOAD_FAILED = 'PUBLIC_LINK_DOWNLOAD_FAILED';

export type PublicLinkMessageKey =
  | typeof SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE
  | typeof SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID
  | typeof SHARED_ERROR_CODES.TOO_MANY_REQUESTS
  | typeof PUBLIC_LINK_OPEN_FAILED
  | typeof PUBLIC_LINK_DOWNLOAD_FAILED;

/** `neutral`: no es una falla que el visitante corrija (no disponible); `warning`: puede seguir con la ficha. */
export type PublicLinkMessageTone = 'neutral' | 'error' | 'warning';

export interface PublicLinkMessage {
  /** Qué pasó y qué hacer, en tuteo (spec 013b CA-4 a CA-7). */
  readonly title: string;
  readonly tone: PublicLinkMessageTone;
}

type FixedKey = Exclude<PublicLinkMessageKey, typeof SHARED_ERROR_CODES.TOO_MANY_REQUESTS>;

/** Un solo texto por motivo: nunca se dice por qué no está disponible ni cuántos intentos quedan (RN-1). */
const FIXED_MESSAGES: Readonly<Record<FixedKey, PublicLinkMessage>> = {
  [SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE]: {
    title: 'Este enlace ya no está disponible. Pide a quien te lo compartió uno nuevo.',
    tone: 'neutral',
  },
  [SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID]: {
    title: 'La contraseña no es correcta. Revísala y vuelve a intentarlo.',
    tone: 'error',
  },
  [PUBLIC_LINK_OPEN_FAILED]: {
    title: 'No pudimos cargar el archivo compartido. Revisa tu conexión e inténtalo de nuevo.',
    tone: 'error',
  },
  [PUBLIC_LINK_DOWNLOAD_FAILED]: {
    title: 'No pudimos iniciar la descarga. Revisa tu conexión e inténtalo de nuevo.',
    tone: 'warning',
  },
};

/**
 * El `429` de la página es neutro (M-2): el mismo para el bloqueo por red, el techo global y el límite general, sin
 * cuenta regresiva. Los minutos salen de `Retry-After`, hacia arriba y nunca menos de 1.
 */
function tooManyRequestsMessage(retryAfterSeconds = 0): PublicLinkMessage {
  return {
    title: `Hubo demasiados intentos con este enlace. Espera ${minutesFrom(retryAfterSeconds)} minutos e inténtalo de nuevo.`,
    tone: 'warning',
  };
}

/** Texto y tono de un estado de la página por `code`; `retryAfterSeconds` solo cuenta en el `429`. */
export function publicLinkMessage(
  key: PublicLinkMessageKey,
  retryAfterSeconds?: number,
): PublicLinkMessage {
  return key === SHARED_ERROR_CODES.TOO_MANY_REQUESTS
    ? tooManyRequestsMessage(retryAfterSeconds)
    : FIXED_MESSAGES[key];
}
