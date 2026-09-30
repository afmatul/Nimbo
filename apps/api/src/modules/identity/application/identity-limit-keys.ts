import { createHash } from 'node:crypto';

import { EMAIL_REQUEST_COOLDOWN_SECONDS, EMAIL_REQUESTS_PER_HOUR } from '@nimbo/contracts';

import type { RateLimitRule } from '../../../shared';
import type { EmailAddress } from '../domain/email-address.vo';

const SECONDS_PER_HOUR = 3600;

/**
 * 001 D-8 y 002 D-6: una solicitud cada 60 s y 5 por hora por correo. La usan el registro y el reenvío (misma clave)
 * y la recuperación (clave propia).
 */
export const EMAIL_REQUEST_RULES: readonly RateLimitRule[] = [
  { limit: 1, windowSeconds: EMAIL_REQUEST_COOLDOWN_SECONDS },
  { limit: EMAIL_REQUESTS_PER_HOUR, windowSeconds: SECONDS_PER_HOUR },
];

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
