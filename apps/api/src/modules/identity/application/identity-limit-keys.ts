import { createHash } from 'node:crypto';

import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  EMAIL_REQUESTS_PER_HOUR,
  LOGIN_FAILURE_WINDOW_MINUTES,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_FAILURES,
  PASSWORD_CHANGE_LOCK_MINUTES,
  PASSWORD_CHANGE_MAX_FAILURES,
  PASSWORD_CHANGE_WINDOW_MINUTES,
} from '@nimbo/contracts';

import type { RateLimitRule } from '../../../shared';
import type { EmailAddress } from '../domain/email-address.vo';

import type { LockoutPolicy } from './ports/i-attempt-lockout.port';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/**
 * 001 D-8 y 002 D-6: una solicitud cada 60 s y 5 por hora por correo. La usan el registro y el reenvío (misma clave)
 * y la recuperación (clave propia).
 */
export const EMAIL_REQUEST_RULES: readonly RateLimitRule[] = [
  { limit: 1, windowSeconds: EMAIL_REQUEST_COOLDOWN_SECONDS },
  { limit: EMAIL_REQUESTS_PER_HOUR, windowSeconds: SECONDS_PER_HOUR },
];

/** 002 D-5: 5 fallos por correo normalizado en 15 min bloquean el inicio de sesión 15 min, exista o no la cuenta. */
export const LOGIN_LOCKOUT_POLICY: LockoutPolicy = {
  maxFailures: LOGIN_MAX_FAILURES,
  windowSeconds: LOGIN_FAILURE_WINDOW_MINUTES * SECONDS_PER_MINUTE,
  lockSeconds: LOGIN_LOCK_MINUTES * SECONDS_PER_MINUTE,
};

/** 002 D-7: 5 contraseñas actuales incorrectas en 15 min bloquean el cambio 15 min, sin cerrar la sesión. */
export const PASSWORD_CHANGE_LOCKOUT_POLICY: LockoutPolicy = {
  maxFailures: PASSWORD_CHANGE_MAX_FAILURES,
  windowSeconds: PASSWORD_CHANGE_WINDOW_MINUTES * SECONDS_PER_MINUTE,
  lockSeconds: PASSWORD_CHANGE_LOCK_MINUTES * SECONDS_PER_MINUTE,
};

const sha256Of = (email: EmailAddress): string =>
  createHash('sha256').update(email.value).digest('hex');

// Las claves de límites y bloqueos llevan el SHA-256 del correo o el `userId`, nunca el correo (plan 002 §6.4).

/** Registro y reenvío de verificación (001 CA-15). La recuperación no la usa, ni para cuentas sin verificar (002 DT-7). */
export const emailRequestKey = (email: EmailAddress): string =>
  `identity:email-request:${sha256Of(email)}`;

/** Pedir el enlace de recuperación (002 CA-18). */
export const passwordResetRequestKey = (email: EmailAddress): string =>
  `identity:password-reset-request:${sha256Of(email)}`;

/** Bloqueo del inicio de sesión por correo (002 D-5, CA-5). */
export const loginLockoutKey = (email: EmailAddress): string =>
  `identity:lockout:login:${sha256Of(email)}`;

/** Bloqueo del cambio de contraseña por cuenta (002 D-7, CA-23); restablecer también lo quita (DT-5). */
export const passwordChangeLockoutKey = (userId: string): string =>
  `identity:lockout:password-change:${userId}`;
