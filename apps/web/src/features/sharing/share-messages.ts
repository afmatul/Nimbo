import {
  SHARED_ERROR_CODES,
  SHARING_ERROR_CODES,
  SHARING_FIELD_MESSAGES,
  STORAGE_ERROR_CODES,
  type SharingFieldIssueReason,
} from '@nimbo/contracts';

import { messageForCode } from '../../lib/error-catalog';
import { StorageRequestError } from '../storage/storage-request-error';

/**
 * Acción correctiva de un error de compartir o salir (spec 012b CA-3, CA-11) y del enlace público (013c CA-14):
 * `reload` repite la lectura del enlace y `none` no ofrece botón.
 */
export type ShareFix = 'retry' | 'fix_email' | 'renew' | 'wait' | 'refresh' | 'reload' | 'none';

export interface ShareMessage {
  /** Qué pasó y qué hacer, en tuteo. */
  readonly title: string;
  readonly fix: ShareFix;
}

/** Rótulo del botón de cada acción; esperar no tiene botón (el texto dice cuánto), ni `none`. */
export const SHARE_FIX_LABELS: Readonly<Record<ShareFix, string | null>> = {
  retry: 'Reintentar',
  fix_email: 'Corregir el correo',
  renew: 'Renovar plan',
  refresh: 'Actualizar lista',
  wait: null,
  reload: 'Actualizar',
  none: null,
};

const NETWORK_MESSAGE: ShareMessage = {
  title: 'No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo.',
  fix: 'retry',
};

/** Textos de la 012 §6 (los mismos que arma el servidor). */
const CODE_MESSAGES: Readonly<Record<string, ShareMessage>> = {
  [SHARING_ERROR_CODES.SHARING_RECIPIENT_NOT_FOUND]: {
    title:
      'No encontramos una cuenta de Nimbo con ese correo. Revisa que esté bien escrito o pídele que se registre.',
    fix: 'fix_email',
  },
  [SHARING_ERROR_CODES.SHARING_CANNOT_SHARE_WITH_SELF]: {
    title: 'Este elemento ya es tuyo. Escribe el correo de otra persona.',
    fix: 'fix_email',
  },
  [SHARING_ERROR_CODES.SHARING_INVALID_LEVEL]: {
    title: SHARING_FIELD_MESSAGES.INVALID_LEVEL,
    fix: 'retry',
  },
  [SHARING_ERROR_CODES.SHARING_SHARE_NOT_FOUND]: {
    title: 'Este acceso ya no existe. Actualiza la lista.',
    fix: 'refresh',
  },
  [STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND]: {
    title:
      'No encontramos este elemento. Puede que ya no exista o esté en la papelera. Actualiza la lista.',
    fix: 'refresh',
  },
  [STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY]: {
    title: messageForCode(STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY),
    fix: 'renew',
  },
};

function isFieldReason(reason: string): reason is SharingFieldIssueReason {
  return Object.prototype.hasOwnProperty.call(SHARING_FIELD_MESSAGES, reason);
}

/** `422 SHARING_INVALID_REQUEST` con `fields`: el texto del primer campo conocido (correo mal formado, CA-3). */
function fieldMessageOf(error: StorageRequestError): ShareMessage {
  const reason = error.fields.map((issue) => issue.reason).find(isFieldReason);
  if (reason === undefined) return NETWORK_MESSAGE;
  return {
    title: SHARING_FIELD_MESSAGES[reason],
    fix: reason === 'INVALID_EMAIL' ? 'fix_email' : 'retry',
  };
}

/** Los minutos salen de `Retry-After`, que el cliente HTTP deja en `details` (catálogo común, 003 §6.2). */
function waitMessageOf(error: StorageRequestError): ShareMessage {
  const seconds = error.details['retryAfterSeconds'];
  const retryAfterSeconds = typeof seconds === 'number' ? seconds : undefined;
  return { title: messageForCode(error.code, { retryAfterSeconds }), fix: 'wait' };
}

/** Mensaje y acción de un error de `sharing` por `code` (RN-2); sin respuesta o desconocido, revisar la conexión. */
export function shareMessageOf(error: unknown): ShareMessage {
  if (!(error instanceof StorageRequestError)) return NETWORK_MESSAGE;
  if (error.code === SHARED_ERROR_CODES.TOO_MANY_REQUESTS) return waitMessageOf(error);
  if (error.code === SHARING_ERROR_CODES.SHARING_INVALID_REQUEST) return fieldMessageOf(error);
  return CODE_MESSAGES[error.code] ?? NETWORK_MESSAGE;
}

/** Los dos casos que la sección «Enlace público» dice distinto que «Compartir» (013c CA-14, D-8, I-2). */
const PUBLIC_LINK_MESSAGES: Readonly<Record<string, ShareMessage>> = {
  [SHARING_ERROR_CODES.SHARING_LINK_NOT_FOUND]: {
    title: 'Este enlace ya no existe. Actualiza para ver el estado actual.',
    fix: 'reload',
  },
  [STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND]: {
    title: 'Este archivo ya no está disponible. Puede que esté en la papelera.',
    fix: 'none',
  },
};

/** Mensaje y acción de un error del enlace público (013c I-3); el resto, como `shareMessageOf` (`429`, red). */
export function publicLinkMessageOf(error: unknown): ShareMessage {
  const own = error instanceof StorageRequestError ? PUBLIC_LINK_MESSAGES[error.code] : undefined;
  return own ?? shareMessageOf(error);
}

/** El `403` de solo lectura, que la sección muestra con `ReadOnlyBanner` y no como error (013c CA-10). */
export function isReadOnlyError(error: unknown): boolean {
  return (
    error instanceof StorageRequestError &&
    error.code === STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY
  );
}
