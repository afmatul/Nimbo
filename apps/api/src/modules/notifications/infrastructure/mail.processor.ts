import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext, REDIS_CLIENT } from '../../../shared';

import { MAIL_QUEUE } from './mail-queue';
import type { MailJobData } from './mail-queue';
import { SmtpTransport } from './smtp-transport';

/** Marca de «ya enviado» (segunda capa de idempotencia, ADR-0018): una semana, más que cualquier reintento. */
const SENT_MARKER_PREFIX = 'mail:sent:';
const SENT_MARKER_TTL_SECONDS = 604_800;

/** Solo los códigos de nodemailer: su `message` incluye la dirección del destinatario (D-18). */
interface MailErrorCodes {
  readonly errorCode: string | undefined;
  readonly responseCode: number | undefined;
}

const codesOf = (error: unknown): MailErrorCodes => {
  const source =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  return {
    errorCode: typeof source.code === 'string' ? source.code : undefined,
    responseCode: typeof source.responseCode === 'number' ? source.responseCode : undefined,
  };
};

const runInJobContext = <T>(job: Job<MailJobData>, work: () => T): T =>
  CorrelationContext.run({ correlationId: job.data.correlationId, jobId: String(job.id) }, work);

/**
 * Consumidor de `mail` (solo `worker`, ADR-0018). Corre con el `correlationId` de la petición que encoló (CA-18).
 * Revisa la marca `mail:sent:<jobId>` antes de entregar y la escribe tras un envío aceptado, así un reintento o un
 * trabajo estancado tras un éxito no reenvía. Las bitácoras solo llevan `tag`, `recipientId`, `jobId`,
 * `attemptsMade` y códigos de error: nunca `job.data`, el mensaje ni `err.message` (plan §6.6).
 */
@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(
    private readonly transport: SmtpTransport,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  process(job: Job<MailJobData>): Promise<void> {
    return runInJobContext(job, () => this.deliverOnce(job));
  }

  /** `failed` llega en cada intento fallido; solo el último (intentos agotados) es `mail.failed` (CA-21). */
  @OnWorkerEvent('failed')
  onFailed(job: Job<MailJobData> | undefined, error: Error): void {
    if (job === undefined || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    runInJobContext(job, () => {
      this.logger.error({
        event: 'mail.failed',
        tag: job.data.tag,
        recipientId: job.data.recipientId,
        attemptsMade: job.attemptsMade,
        ...codesOf(error),
      });
    });
  }

  private async deliverOnce(job: Job<MailJobData>): Promise<void> {
    const jobId = String(job.id);
    const marker = `${SENT_MARKER_PREFIX}${jobId}`;
    if ((await this.redis.exists(marker)) === 1) {
      this.logger.info({ event: 'mail.duplicate_skipped', tag: job.data.tag, jobId });
      return;
    }
    const attempt = job.attemptsMade + 1;
    try {
      await this.transport.deliver(job.data, jobId);
    } catch (error) {
      this.logRetryIfPending(job, attempt, error);
      throw error;
    }
    await this.redis.set(marker, '1', 'EX', SENT_MARKER_TTL_SECONDS, 'NX');
    this.logger.info({
      event: 'mail.sent',
      tag: job.data.tag,
      recipientId: job.data.recipientId,
      attemptsMade: attempt,
    });
  }

  private logRetryIfPending(job: Job<MailJobData>, attempt: number, error: unknown): void {
    if (attempt >= (job.opts.attempts ?? 1)) return;
    this.logger.warn({
      event: 'mail.retry_scheduled',
      tag: job.data.tag,
      recipientId: job.data.recipientId,
      attemptsMade: attempt,
      ...codesOf(error),
    });
  }
}
