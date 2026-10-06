import type { LogLine, LogSink } from '../setup/log-sink';

/** Etiqueta del correo «Nuevo inicio de sesión en Nimbo» en `mail.*` (plan 002 §7). */
export const NEW_DEVICE_MAIL_TAG = 'identity.new-device';
/** Asunto del aviso de dispositivo nuevo (spec 002 §11, CA-16). */
export const NEW_DEVICE_MAIL_SUBJECT = 'Nuevo inicio de sesión en Nimbo';

/**
 * Avisos de dispositivo nuevo encolados para `userId`. `IMailer.send` registra `mail.enqueued` antes de que la
 * petición responda, así que su ausencia tras la respuesta prueba que no se envió ningún aviso (sin esperar a Mailpit).
 */
export const newDeviceMailsEnqueuedFor = (logs: LogSink, userId: string): LogLine[] =>
  logs
    .lines()
    .filter(
      (line) =>
        line.event === 'mail.enqueued' &&
        line.tag === NEW_DEVICE_MAIL_TAG &&
        line.recipientId === userId,
    );

/** Líneas `identity.device.new` de `userId`. */
export const newDeviceEventsFor = (logs: LogSink, userId: string): LogLine[] =>
  logs.lines().filter((line) => line.event === 'identity.device.new' && line.userId === userId);
