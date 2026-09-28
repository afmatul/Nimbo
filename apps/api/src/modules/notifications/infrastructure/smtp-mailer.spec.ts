import type { JobsOptions, Queue } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';

import { CorrelationContext } from '../../../shared';
import type { MailMessage } from '../application/ports/i-mailer.port';

import { MAIL_JOB_OPTIONS } from './mail-queue';
import { SmtpMailer } from './smtp-mailer';

const KEY = 'identity.verification.5f0c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';

const message: MailMessage = {
  to: 'ana@ejemplo.com',
  subject: 'Asunto secreto',
  text: 'texto con enlace',
  html: '<p>html con enlace</p>',
  idempotencyKey: KEY,
  tag: 'identity.verification',
  recipientId: 'user-1',
};

const setup = (
  jobOptions: Readonly<JobsOptions> = MAIL_JOB_OPTIONS,
): { mailer: SmtpMailer; add: jest.Mock; info: jest.Mock } => {
  const add = jest.fn().mockResolvedValue({ id: KEY });
  const info = jest.fn();
  const queue = { name: 'mail', add } as unknown as Queue;
  const logger = { info } as unknown as PinoLogger;
  return { mailer: new SmtpMailer(queue, jobOptions, logger), add, info };
};

describe('SmtpMailer', () => {
  it('CA-21: encola `send` con el mensaje, el `correlationId` y `MAIL_JOB_OPTIONS` con `jobId = idempotencyKey`', async () => {
    const { mailer, add } = setup();

    await CorrelationContext.run({ correlationId: 'corr-1' }, () => mailer.send(message));

    expect(add).toHaveBeenCalledWith(
      'send',
      { ...message, correlationId: 'corr-1' },
      { ...MAIL_JOB_OPTIONS, jobId: KEY },
    );
  });

  it('CA-21: usa las opciones inyectadas (las pruebas acortan el retroceso) y conserva `jobId = idempotencyKey`', async () => {
    const short = { ...MAIL_JOB_OPTIONS, backoff: { type: 'exponential', delay: 10 } };
    const { mailer, add } = setup(short);

    await mailer.send(message);

    expect(add.mock.calls[0]?.[2]).toEqual({ ...short, jobId: KEY });
  });

  it('CA-21: una clave con `:` lanza sin encolar ni registrar', async () => {
    const { mailer, add, info } = setup();

    await expect(
      mailer.send({ ...message, idempotencyKey: 'identity:verification:1' }),
    ).rejects.toThrow(/idempotencyKey/);

    expect(add).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('CA-18: registra `mail.enqueued` solo con `tag`, `recipientId` y `jobId`', async () => {
    const { mailer, info } = setup();

    await mailer.send(message);

    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith({
      event: 'mail.enqueued',
      tag: 'identity.verification',
      recipientId: 'user-1',
      jobId: KEY,
    });
  });
});
