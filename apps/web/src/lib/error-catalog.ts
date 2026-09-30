import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  IDENTITY_ERROR_CODES,
  IDENTITY_FIELD_MESSAGES,
  LOGIN_LOCK_MINUTES,
  PASSWORD_CHANGE_LOCK_MINUTES,
  SHARED_ERROR_CODES,
  SUPPORT_CONTACT_EMAIL,
  type FieldIssueReason,
} from '@nimbo/contracts';

import { genericErrorMessage } from './api-error';

export { IDENTITY_FIELD_MESSAGES };

const SECONDS_PER_MINUTE = 60;

/** Pantalla con texto propio para `IDENTITY_TOO_MANY_REQUESTS` (002 DT-20); sin ella, el de los enlaces de 001. */
export type ErrorScreen = 'login';

export interface MessageOptions {
  readonly correlationId?: string;
  readonly retryAfterSeconds?: number | undefined;
  readonly screen?: ErrorScreen;
}

const CODE_MESSAGES: Readonly<Record<string, string>> = {
  [IDENTITY_ERROR_CODES.INVALID_INPUT]: 'Revisa los campos marcados y corrígelos para continuar.',
  [IDENTITY_ERROR_CODES.WEAK_PASSWORD]:
    'Tu contraseña no cumple estos requisitos. Elige otra que los cumpla.',
  [IDENTITY_ERROR_CODES.VERIFICATION_LINK_EXPIRED]:
    'Este enlace venció. Pide uno nuevo y ábrelo en las próximas 24 horas.',
  [IDENTITY_ERROR_CODES.VERIFICATION_LINK_INVALID]:
    'Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.',
  [IDENTITY_ERROR_CODES.INVALID_CREDENTIALS]:
    'El correo o la contraseña no son correctos. Revísalos o restablece tu contraseña.',
  [IDENTITY_ERROR_CODES.EMAIL_NOT_VERIFIED]:
    'Verifica tu correo con el enlace que te enviamos; si venció, pide uno nuevo.',
  [IDENTITY_ERROR_CODES.ACCOUNT_SUSPENDED]: `Tu cuenta está suspendida. Si crees que es un error, escríbenos a ${SUPPORT_CONTACT_EMAIL}.`,
  [IDENTITY_ERROR_CODES.REFRESH_INVALID]: 'Tu sesión no es válida. Inicia sesión de nuevo.',
  [IDENTITY_ERROR_CODES.SESSION_EXPIRED]: 'Tu sesión terminó. Inicia sesión de nuevo.',
  [IDENTITY_ERROR_CODES.SESSION_REVOKED]: 'Tu sesión se cerró. Inicia sesión de nuevo.',
  [IDENTITY_ERROR_CODES.SESSION_NOT_FOUND]: 'No encontramos esa sesión. Actualiza la lista.',
  [IDENTITY_ERROR_CODES.RESET_LINK_EXPIRED]:
    'Este enlace venció. Pide uno nuevo y úsalo en la próxima hora.',
  [IDENTITY_ERROR_CODES.RESET_LINK_INVALID]:
    'Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.',
  [IDENTITY_ERROR_CODES.WRONG_PASSWORD]: 'La contraseña actual no es correcta.',
  [SHARED_ERROR_CODES.UNAUTHENTICATED]: 'Tu sesión no es válida o expiró. Inicia sesión de nuevo.',
  [SHARED_ERROR_CODES.FORBIDDEN]: `Tu cuenta no tiene permiso para esta acción. Si crees que es un error, escríbenos a ${SUPPORT_CONTACT_EMAIL}.`,
};

interface TimedMessage {
  /** Espera por omisión si no llegó `Retry-After`. */
  readonly defaultSeconds: number;
  readonly text: (minutes: string) => string;
}

/** Mensajes con los minutos de espera, calculados de `Retry-After` (spec 002 §11). */
const TIMED_MESSAGES: Readonly<Record<string, TimedMessage>> = {
  [IDENTITY_ERROR_CODES.LOGIN_LOCKED]: {
    defaultSeconds: LOGIN_LOCK_MINUTES * SECONDS_PER_MINUTE,
    text: (minutes) =>
      `Hubo demasiados intentos fallidos. Espera ${minutes} minutos o restablece tu contraseña.`,
  },
  [IDENTITY_ERROR_CODES.PASSWORD_CHANGE_LOCKED]: {
    defaultSeconds: PASSWORD_CHANGE_LOCK_MINUTES * SECONDS_PER_MINUTE,
    text: (minutes) =>
      `Hiciste demasiados intentos con una contraseña incorrecta. Espera ${minutes} minutos o restablece tu contraseña.`,
  },
  [IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS]: {
    defaultSeconds: EMAIL_REQUEST_COOLDOWN_SECONDS,
    text: (minutes) =>
      `Ya te enviamos un enlace hace poco. Revisa tu bandeja y la carpeta de spam, o inténtalo de nuevo en ${minutes} minutos.`,
  },
};

const LOGIN_RATE_LIMIT_MESSAGE =
  'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.';

function isReason(value: string): value is FieldIssueReason {
  return Object.prototype.hasOwnProperty.call(IDENTITY_FIELD_MESSAGES, value);
}

function minutesFrom(seconds: number): string {
  return String(Math.max(1, Math.ceil(seconds / SECONDS_PER_MINUTE)));
}

/** Mensaje de un `reason` de `fields`. Uno desconocido cae en el genérico de 000 §10. */
export function messageForReason(reason: string, correlationId = ''): string {
  return isReason(reason) ? IDENTITY_FIELD_MESSAGES[reason] : genericErrorMessage(correlationId);
}

/**
 * Mensaje de un `code` (specs 001 y 002 §11; 003 plan §6.2 para `SHARED_*`). Los bloqueos usan los minutos de `Retry-After`; el 429 por IP del
 * inicio de sesión tiene su propio texto (DT-20). Un código desconocido es el genérico de 000 §10.
 */
export function messageForCode(code: string, options: MessageOptions = {}): string {
  if (code === IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS && options.screen === 'login') {
    return LOGIN_RATE_LIMIT_MESSAGE;
  }
  const timed = TIMED_MESSAGES[code];
  if (timed !== undefined) {
    return timed.text(minutesFrom(options.retryAfterSeconds ?? timed.defaultSeconds));
  }
  return CODE_MESSAGES[code] ?? genericErrorMessage(options.correlationId ?? '');
}
