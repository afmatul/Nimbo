import { IDENTITY_ERROR_CODES, IDENTITY_FIELD_MESSAGES, type FieldIssueReason } from '@nimbo/contracts';

import { genericErrorMessage } from './api-error';

export { IDENTITY_FIELD_MESSAGES };

const MINUTE_MS = 60;

const CODE_MESSAGES: Readonly<Record<string, string>> = {
  [IDENTITY_ERROR_CODES.INVALID_INPUT]: 'Revisa los campos marcados y corrígelos para continuar.',
  [IDENTITY_ERROR_CODES.WEAK_PASSWORD]:
    'Tu contraseña no cumple estos requisitos. Elige otra que los cumpla.',
  [IDENTITY_ERROR_CODES.VERIFICATION_LINK_EXPIRED]:
    'Este enlace venció. Pide uno nuevo y ábrelo en las próximas 24 horas.',
  [IDENTITY_ERROR_CODES.VERIFICATION_LINK_INVALID]:
    'Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.',
};

function isReason(value: string): value is FieldIssueReason {
  return Object.prototype.hasOwnProperty.call(IDENTITY_FIELD_MESSAGES, value);
}

/** Mensaje de un `reason` de `fields`. Uno desconocido cae en el genérico de 000 §10. */
export function messageForReason(reason: string, correlationId = ''): string {
  return isReason(reason) ? IDENTITY_FIELD_MESSAGES[reason] : genericErrorMessage(correlationId);
}

/** Mensaje de un `code`. El 429 usa los minutos de `Retry-After`. Un código desconocido es el genérico. */
export function messageForCode(
  code: string,
  options: { readonly correlationId?: string; readonly retryAfterSeconds?: number } = {},
): string {
  if (code === IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS) {
    const minutes = Math.max(1, Math.ceil((options.retryAfterSeconds ?? MINUTE_MS) / MINUTE_MS));
    return `Ya te enviamos un enlace hace poco. Revisa tu bandeja y la carpeta de spam, o inténtalo de nuevo en ${String(minutes)} minutos.`;
  }
  return CODE_MESSAGES[code] ?? genericErrorMessage(options.correlationId ?? '');
}
