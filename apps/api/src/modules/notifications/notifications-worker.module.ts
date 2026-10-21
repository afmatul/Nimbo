import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { I_MAILER } from './application/ports/i-mailer.port';
import { I_NOTIFIER } from './application/ports/i-notifier.port';
import { MailNotifier } from './infrastructure/mail-notifier';
import { MAIL_JOB_OPTIONS, MAIL_JOB_OPTIONS_TOKEN, MAIL_QUEUE } from './infrastructure/mail-queue';
import { MailProcessor } from './infrastructure/mail.processor';
import { SmtpMailer } from './infrastructure/smtp-mailer';
import { SmtpTransport } from './infrastructure/smtp-transport';

/**
 * Lado `worker` de `notifications` (001 plan §6.6): consume `mail` y entrega por SMTP. `SmtpTransport` lee `SMTP_*`
 * y `MAIL_FROM` del `ENV` que publica `WorkerModule` (validado con `workerEnvSchema`); `REDIS_CLIENT` llega del
 * `SharedModule` global.
 */
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [
    SmtpTransport,
    MailProcessor,
    // 009: `invoice-retry` repone el aviso del comprobante desde el `worker`.
    { provide: MAIL_JOB_OPTIONS_TOKEN, useValue: MAIL_JOB_OPTIONS },
    { provide: I_MAILER, useClass: SmtpMailer },
    { provide: I_NOTIFIER, useClass: MailNotifier },
  ],
  exports: [I_NOTIFIER],
})
export class NotificationsWorkerModule {}
