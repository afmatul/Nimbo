import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MAIL_QUEUE } from './infrastructure/mail-queue';
import { MailProcessor } from './infrastructure/mail.processor';
import { SmtpTransport } from './infrastructure/smtp-transport';

/**
 * Lado `worker` de `notifications` (001 plan §6.6): consume `mail` y entrega por SMTP. `SmtpTransport` lee `SMTP_*`
 * y `MAIL_FROM` del `ENV` que publica `WorkerModule` (validado con `workerEnvSchema`); `REDIS_CLIENT` llega del
 * `SharedModule` global.
 */
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [SmtpTransport, MailProcessor],
})
export class NotificationsWorkerModule {}
