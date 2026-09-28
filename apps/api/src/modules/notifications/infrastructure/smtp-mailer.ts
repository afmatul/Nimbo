import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { enqueueWithCorrelation } from '../../../shared';
import { assertIdempotencyKey } from '../application/ports/i-mailer.port';
import type { IMailer, MailMessage } from '../application/ports/i-mailer.port';

import { MAIL_JOB_NAME, MAIL_JOB_OPTIONS, MAIL_QUEUE } from './mail-queue';

/**
 * `IMailer` del diagrama T4 (ADR-0018). En `api` solo **encola** en `mail` con `jobId = idempotencyKey` (BullMQ no
 * duplica un trabajo con el mismo id); la entrega por SMTP ocurre en el `worker` (`MailProcessor`), así el `api` no
 * necesita las credenciales SMTP y responde igual con el servidor de correo caído (CA-21).
 */
@Injectable()
export class SmtpMailer implements IMailer {
  constructor(
    @InjectQueue(MAIL_QUEUE) private readonly queue: Queue,
    private readonly logger: PinoLogger,
  ) {}

  async send(message: MailMessage): Promise<void> {
    assertIdempotencyKey(message.idempotencyKey);
    const job = await enqueueWithCorrelation(
      this.queue,
      MAIL_JOB_NAME,
      { ...message },
      { ...MAIL_JOB_OPTIONS, jobId: message.idempotencyKey },
    );
    // Nunca el mensaje: `to`, asunto y cuerpo llevan el correo y el enlace (CA-18).
    this.logger.info({
      event: 'mail.enqueued',
      tag: message.tag,
      recipientId: message.recipientId,
      jobId: job.id,
    });
  }
}
