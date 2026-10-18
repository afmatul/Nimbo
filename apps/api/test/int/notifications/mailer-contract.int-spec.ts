import { randomUUID } from 'node:crypto';

import {
  I_MAILER,
  NotificationsModule,
  NotificationsWorkerModule,
} from '../../../src/modules/notifications';
import type { IMailer, MailMessage } from '../../../src/modules/notifications';
import { CorrelationContext } from '../../../src/shared';
import { clearMailQueue } from '../../support/mail-queue';
import { deleteAll, getMessage, waitForMessages } from '../setup/mailpit';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { waitForLog } from '../setup/wait-for-log';

const messageWith = (idempotencyKey: string): MailMessage => ({
  to: 'ana.lopez@ejemplo.com',
  subject: 'Verifica tu correo para entrar a Nimbo',
  text: 'Abre el enlace para verificar tu correo.',
  html: '<p>Abre <a href="http://localhost/verificar-correo#token=abc">el enlace</a>.</p>',
  idempotencyKey,
  tag: 'identity.verification',
  recipientId: 'user-contract',
});

/**
 * Prueba de contrato de `IMailer` (Liskov, 001 plan §6.6): el adaptador real (`SmtpMailer` en `api` +
 * `MailProcessor` en `worker`) contra Mailpit, con ambos lados en la misma app y un solo `LogSink`.
 */
describe('contrato de IMailer contra Mailpit (CA-21, CA-18)', () => {
  let testApp: TestApp;
  let mailer: IMailer;

  beforeAll(async () => {
    // Antes de levantar el `worker`: un correo que otra suite dejó encolado no debe llegar a Mailpit (PR #62).
    await clearMailQueue();
    testApp = await createTestApp({
      withWorkerEnv: true,
      modules: [NotificationsModule, NotificationsWorkerModule],
    });
    mailer = testApp.app.get<IMailer>(I_MAILER);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await deleteAll();
    testApp.logs.clear();
  });

  it('CA-21: `send` entrega un correo con destinatario, asunto, texto y HTML', async () => {
    const message = messageWith(`identity.verification.${randomUUID()}`);

    await mailer.send(message);

    const [summary] = await waitForMessages(1);
    const received = await getMessage(summary?.ID ?? '');
    expect(received.To.map((to) => to.Address)).toEqual([message.to]);
    expect(received.Subject).toBe(message.subject);
    expect(received.Text).toContain(message.text);
    expect(received.HTML).toContain('http://localhost/verificar-correo#token=abc');
  });

  it('CA-18: las líneas del `worker` llevan el `correlationId` de la petición que encoló', async () => {
    const key = `identity.verification.${randomUUID()}`;

    await CorrelationContext.run({ correlationId: 'corr-contrato' }, () =>
      mailer.send(messageWith(key)),
    );

    const sent = await waitForLog(testApp.logs, (line) => line.event === 'mail.sent');
    expect(sent).toMatchObject({
      correlationId: 'corr-contrato',
      jobId: key,
      tag: 'identity.verification',
      recipientId: 'user-contract',
      attemptsMade: 1,
    });
  });

  it('CA-21: dos `send` con la misma clave entregan un solo correo', async () => {
    const key = `identity.verification.${randomUUID()}`;

    await mailer.send(messageWith(key));
    await waitForLog(testApp.logs, (line) => line.event === 'mail.sent' && line.jobId === key);
    await mailer.send(messageWith(key));
    await waitForLog(
      testApp.logs,
      (line) => line.event === 'mail.duplicate_skipped' && line.jobId === key,
    );

    await expect(waitForMessages(1)).resolves.toHaveLength(1);
  });
});
