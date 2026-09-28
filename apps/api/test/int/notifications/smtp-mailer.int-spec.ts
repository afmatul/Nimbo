import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import { I_MAILER, NotificationsModule } from '../../../src/modules/notifications';
import type { IMailer, MailMessage } from '../../../src/modules/notifications';
import {
  MAIL_JOB_OPTIONS,
  MAIL_QUEUE,
} from '../../../src/modules/notifications/infrastructure/mail-queue';
import { CorrelationContext } from '../../../src/shared';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

const RECIPIENT = 'ana.lopez@ejemplo.com';
const SUBJECT = 'Verifica tu correo para entrar a Nimbo';
const LINK = 'http://localhost/verificar-correo#token=abc';

const messageWith = (idempotencyKey: string): MailMessage => ({
  to: RECIPIENT,
  subject: SUBJECT,
  text: `Abre ${LINK}`,
  html: `<a href="${LINK}">Verificar</a>`,
  idempotencyKey,
  tag: 'identity.verification',
  recipientId: 'user-1',
});

/** Solo el productor (`api`): nadie consume la cola, así los trabajos quedan esperando y se pueden inspeccionar. */
describe('SmtpMailer (CA-18, CA-21)', () => {
  let testApp: TestApp;
  let mailer: IMailer;
  let queue: Queue;

  beforeAll(async () => {
    testApp = await createTestApp({ modules: [NotificationsModule] });
    mailer = testApp.app.get<IMailer>(I_MAILER);
    queue = testApp.app.get<Queue>(getQueueToken(MAIL_QUEUE));
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await testApp.close();
  });

  beforeEach(async () => {
    await queue.obliterate({ force: true });
    testApp.logs.clear();
  });

  it('CA-21: `send` crea un trabajo `send` con `jobId = idempotencyKey`, el `correlationId` de la petición y `MAIL_JOB_OPTIONS`', async () => {
    const key = `identity.verification.${randomUUID()}`;

    await CorrelationContext.run({ correlationId: 'corr-mail' }, () =>
      mailer.send(messageWith(key)),
    );

    const job = await queue.getJob(key);
    expect(job?.name).toBe('send');
    expect(job?.data).toMatchObject({ correlationId: 'corr-mail', idempotencyKey: key });
    expect(job?.opts).toMatchObject({ ...MAIL_JOB_OPTIONS, jobId: key });
  });

  it('CA-21: dos `send` con la misma clave dejan un solo trabajo', async () => {
    const key = `identity.verification.${randomUUID()}`;

    await mailer.send(messageWith(key));
    await mailer.send(messageWith(key));

    await expect(queue.count()).resolves.toBe(1);
  });

  it('CA-21: una clave con `:` lanza sin encolar', async () => {
    await expect(mailer.send(messageWith(`identity:verification:${randomUUID()}`))).rejects.toThrow(
      /idempotencyKey/,
    );

    await expect(queue.count()).resolves.toBe(0);
  });

  it('CA-18: `mail.enqueued` lleva `tag`, `recipientId` y `jobId`, y no el correo, el asunto ni el cuerpo', async () => {
    const key = `identity.verification.${randomUUID()}`;

    await CorrelationContext.run({ correlationId: 'corr-log' }, () =>
      mailer.send(messageWith(key)),
    );

    const enqueued = testApp.logs.lines().find((line) => line.event === 'mail.enqueued');
    expect(enqueued).toMatchObject({
      tag: 'identity.verification',
      recipientId: 'user-1',
      jobId: key,
      correlationId: 'corr-log',
    });
    const everything = JSON.stringify(testApp.logs.lines());
    for (const secret of [RECIPIENT, SUBJECT, LINK]) {
      expect(everything).not.toContain(secret);
    }
  });
});
