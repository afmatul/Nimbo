import type { MailMessage } from '../../notifications';

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

/** Un correo de `billing`: destinatario, asunto, líneas, etiqueta y lo que hace única su clave. */
export interface BillingMail {
  readonly to: string;
  readonly recipientId: string;
  readonly subject: string;
  readonly lines: readonly string[];
  readonly tag: string;
  /** Sin `:` (ADR-0018): la clave es `<tag>.<key>` y es el `jobId` de la cola `mail`. */
  readonly key: string;
}

/**
 * Arma el `MailMessage` con las mismas líneas en texto y en HTML escapado (009 CA-6; 010 CA-2, CA-5, CA-29). La clave
 * `<tag>.<key>` evita duplicados aunque se vuelva a encolar: `MailProcessor` guarda la marca `mail:sent:<jobId>` 7 días.
 */
export const billingMail = ({
  to,
  recipientId,
  subject,
  lines,
  tag,
  key,
}: BillingMail): MailMessage => ({
  to,
  subject,
  text: lines.join('\n'),
  html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
  idempotencyKey: `${tag}.${key}`,
  tag,
  recipientId,
});
