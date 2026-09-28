import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

import type { StartedTestContainer } from 'testcontainers';

import {
  I_MAILER,
  NotificationsModule,
  NotificationsWorkerModule,
} from '../../../src/modules/notifications';
import type { IMailer, MailMessage } from '../../../src/modules/notifications';
import {
  MAIL_JOB_OPTIONS,
  MAIL_JOB_OPTIONS_TOKEN,
} from '../../../src/modules/notifications/infrastructure/mail-queue';
import { CorrelationContext } from '../../../src/shared';
import { mailpitApiUrl, startMailpit } from '../setup/containers';
import { listMessages, waitForMessages } from '../setup/mailpit';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { waitForLog } from '../setup/wait-for-log';

/** Retroceso corto: 0,5, 1, 2, 4 y 8 s (~15 s para agotar los 6 intentos en lugar de ~2,5 min). */
const SHORT_BACKOFF_MS = 500;
const EXHAUSTION_WAIT_MS = 60_000;
const PINO_ERROR_LEVEL = 50;
const MAIL_ATTEMPTS = MAIL_JOB_OPTIONS.attempts ?? 1;

const messageWith = (idempotencyKey: string): MailMessage => ({
  to: 'ana.lopez@ejemplo.com',
  subject: 'Verifica tu correo para entrar a Nimbo',
  text: 'Abre el enlace para verificar tu correo.',
  html: '<p>Abre el enlace.</p>',
  idempotencyKey,
  tag: 'identity.verification',
  recipientId: 'user-degradation',
});

/** Un puerto del host sin servidor; más tarde Mailpit se publica justo ahí. */
const freePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

/**
 * Degradación del SMTP (CA-21, Art. XII): el `worker` apunta a un puerto fijo sin servidor. Si el servidor vuelve
 * antes de agotar los intentos llega **un** correo; si no, `mail.failed` con el `correlationId` de la petición.
 */
describe('degradación del SMTP (CA-21, CA-18)', () => {
  let testApp: TestApp;
  let mailer: IMailer;
  let smtpPort = 0;
  let lateMailpit: StartedTestContainer | undefined;

  beforeAll(async () => {
    smtpPort = await freePort();
    testApp = await createTestApp({
      withWorkerEnv: true,
      env: { SMTP_PORT: String(smtpPort) },
      modules: [NotificationsModule, NotificationsWorkerModule],
      overrides: [
        {
          provide: MAIL_JOB_OPTIONS_TOKEN,
          useValue: {
            ...MAIL_JOB_OPTIONS,
            backoff: { type: 'exponential', delay: SHORT_BACKOFF_MS },
          },
        },
      ],
    });
    mailer = testApp.app.get<IMailer>(I_MAILER);
  });

  afterAll(async () => {
    await testApp.close();
    await lateMailpit?.stop();
  });

  beforeEach(() => {
    testApp.logs.clear();
  });

  it('CA-21: con los intentos agotados registra `mail.failed` con `correlationId` y `recipientId`', async () => {
    const key = `identity.verification.${randomUUID()}`;

    await CorrelationContext.run({ correlationId: 'corr-agotado' }, () =>
      mailer.send(messageWith(key)),
    );

    const failed = await waitForLog(
      testApp.logs,
      (line) => line.event === 'mail.failed' && line.jobId === key,
      EXHAUSTION_WAIT_MS,
    );
    expect(failed).toMatchObject({
      level: PINO_ERROR_LEVEL,
      correlationId: 'corr-agotado',
      recipientId: 'user-degradation',
      tag: 'identity.verification',
      attemptsMade: MAIL_ATTEMPTS,
      errorCode: expect.any(String),
    });
    const retries = testApp.logs
      .lines()
      .filter((line) => line.event === 'mail.retry_scheduled' && line.jobId === key);
    expect(retries).toHaveLength(MAIL_ATTEMPTS - 1);
  });

  it('CA-21: si el servidor vuelve antes de agotar los intentos llega un solo correo', async () => {
    const key = `identity.verification.${randomUUID()}`;

    await mailer.send(messageWith(key));
    await waitForLog(
      testApp.logs,
      (line) => line.event === 'mail.retry_scheduled' && line.jobId === key,
    );
    lateMailpit = await startMailpit({ smtpHostPort: smtpPort });
    const apiUrl = mailpitApiUrl(lateMailpit);

    await waitForLog(
      testApp.logs,
      (line) => line.event === 'mail.sent' && line.jobId === key,
      EXHAUSTION_WAIT_MS,
    );
    await waitForMessages(1, { baseUrl: apiUrl });
    await expect(listMessages(apiUrl)).resolves.toHaveLength(1);
    expect(testApp.logs.lines().some((line) => line.event === 'mail.failed')).toBe(false);
  });
});
