/**
 * Mensaje de correo transaccional (001 plan §6.6, ADR-0018). `notifications` no conoce las reglas de quien envía:
 * recibe qué enviar y a quién.
 *
 * - `idempotencyKey`: clave que decide el productor con el formato `<tag>.<id>` (p. ej.
 *   `identity.verification.<uuid>`, `identity.attempt-notice.<uuid>`). Solo letras ASCII, dígitos, `.`, `-` y `_`;
 *   **nunca `:`**, porque se usa como `jobId` de BullMQ y este lo rechaza. Dos `send` con la misma clave entregan un
 *   solo correo.
 * - `tag` y `recipientId` (id de la cuenta) sirven solo para las bitácoras; `to`, `subject`, `text` y `html` nunca se
 *   registran.
 */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly idempotencyKey: string;
  readonly tag: string;
  readonly recipientId?: string;
}

/** Puerto de correo (ADR-0010): lo declara e implementa `notifications`; lo usa `identity`. */
export interface IMailer {
  send(message: MailMessage): Promise<void>;
}

export const I_MAILER = Symbol('I_MAILER');

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Lanza si la clave no cumple el formato documentado en `MailMessage` (error de programación del productor). */
export const assertIdempotencyKey = (key: string): void => {
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new Error(
      'La `idempotencyKey` del correo solo admite letras, dígitos, `.`, `-` y `_` (formato `<tag>.<id>`, sin `:`).',
    );
  }
};
