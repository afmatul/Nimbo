// API pública del módulo `notifications`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
export { assertIdempotencyKey, I_MAILER } from './application/ports/i-mailer.port';
export type { IMailer, MailMessage } from './application/ports/i-mailer.port';
export { MAIL_QUEUE } from './infrastructure/mail-queue';
export { NotificationsModule } from './notifications.module';
export { NotificationsWorkerModule } from './notifications-worker.module';
