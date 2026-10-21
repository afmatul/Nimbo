import type { MailMessage } from './i-mailer.port';

/**
 * Puerto de avisos (ADR-0010, `architecture.md` §5): lo declara e implementa `notifications`; lo usa `billing` para el
 * comprobante (spec 009 CA-6). Es distinto de `IMailer` (ISP: otro consumidor), pero comparte `MailMessage` mientras el
 * único canal sea el correo (decisión 4 de Adrián); un segundo canal separará los mensajes.
 */
export interface INotifier {
  notify(message: MailMessage): Promise<void>;
}

export const I_NOTIFIER = Symbol('I_NOTIFIER');
