import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { I_MAILER } from './application/ports/i-mailer.port';
import { MAIL_JOB_OPTIONS, MAIL_JOB_OPTIONS_TOKEN, MAIL_QUEUE } from './infrastructure/mail-queue';
import { SmtpMailer } from './infrastructure/smtp-mailer';

/** Lado `api` de `notifications` (001 plan §6.6): registra la cola `mail` y publica `I_MAILER → SmtpMailer` con
 * `MAIL_JOB_OPTIONS`. */
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [
    { provide: MAIL_JOB_OPTIONS_TOKEN, useValue: MAIL_JOB_OPTIONS },
    { provide: I_MAILER, useClass: SmtpMailer },
  ],
  exports: [I_MAILER],
})
export class NotificationsModule {}
