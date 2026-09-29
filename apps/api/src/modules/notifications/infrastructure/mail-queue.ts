import type { JobsOptions } from 'bullmq';

import type { MailMessage } from '../application/ports/i-mailer.port';

/** Cola de correo (ADR-0018): la llena `SmtpMailer` en `api` y la consume `MailProcessor` en `worker`. */
export const MAIL_QUEUE = 'mail';

/** Nombre del único tipo de trabajo de la cola. */
export const MAIL_JOB_NAME = 'send';

/** El envío más 5 reintentos (R-9). */
const MAIL_ATTEMPTS = 6;
/** Retroceso exponencial: 5, 10, 20, 40 y 80 s (~2,5 min en total). */
const MAIL_BACKOFF_DELAY_MS = 5000;
/** Los fallidos se conservan 24 h, lo mismo que dura el enlace de verificación. */
const FAILED_RETENTION_SECONDS = 86_400;

/** Opciones de cada trabajo de `mail` (001 plan §6.6). El `jobId` lo agrega `SmtpMailer` con la `idempotencyKey`. */
export const MAIL_JOB_OPTIONS: Readonly<JobsOptions> = Object.freeze({
  attempts: MAIL_ATTEMPTS,
  backoff: Object.freeze({ type: 'exponential', delay: MAIL_BACKOFF_DELAY_MS }),
  removeOnComplete: true,
  removeOnFail: Object.freeze({ age: FAILED_RETENTION_SECONDS }),
});

/**
 * Token con el que `NotificationsModule` inyecta `MAIL_JOB_OPTIONS` en `SmtpMailer`: las pruebas de integración lo
 * sustituyen por un retroceso corto para recorrer los reintentos en segundos (001 plan §6.6).
 */
export const MAIL_JOB_OPTIONS_TOKEN = Symbol('MAIL_JOB_OPTIONS');

/**
 * Datos del trabajo: el mensaje y el `correlationId` de la petición que lo encoló (CA-18). Llevan el correo y el
 * enlace: **nunca** se registran (plan §6.7).
 */
export type MailJobData = MailMessage & { readonly correlationId: string };
