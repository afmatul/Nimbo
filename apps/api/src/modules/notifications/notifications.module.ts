import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { I_MAILER } from './application/ports/i-mailer.port';
import { I_NOTIFIER } from './application/ports/i-notifier.port';
import { MailNotifier } from './infrastructure/mail-notifier';
import { MAIL_JOB_OPTIONS, MAIL_JOB_OPTIONS_TOKEN, MAIL_QUEUE } from './infrastructure/mail-queue';
import { SmtpMailer } from './infrastructure/smtp-mailer';

/** Lado `api` de `notifications` (001 plan §6.6): registra la cola `mail` y publica `I_MAILER → SmtpMailer` con
 * `MAIL_JOB_OPTIONS`. */
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [
    { provide: MAIL_JOB_OPTIONS_TOKEN, useValue: MAIL_JOB_OPTIONS },
    { provide: I_MAILER, useClass: SmtpMailer },
    { provide: I_NOTIFIER, useClass: MailNotifier },
  ],
  exports: [I_MAILER, I_NOTIFIER],
})
export class NotificationsModule {}
