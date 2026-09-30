import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { acceptedResponseSchema, EMAIL_REQUEST_COOLDOWN_SECONDS } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';

import { IDENTITY_THROTTLERS, IdentityModule } from '../../../src/modules/identity';
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
import { CorrelationContext, FixedClock, I_CLOCK } from '../../../src/shared';
import { validRegistration } from '../identity/identity-test-app';
import { mailpitApiUrl, startMailpit } from '../setup/containers';
import { listMessages, waitForMessages } from '../setup/mailpit';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { ProviderOverride, TestApp } from '../setup/test-app';
import { waitForLog } from '../setup/wait-for-log';

/**
 * Retroceso corto: 2, 4, 8, 16 y 32 s (~62 s para agotar los 6 intentos en lugar de ~2,5 min). Deja al Mailpit
 * tardío unos 60 s para arrancar después del primer reintento (review-pr2 I-1).
 */
const SHORT_BACKOFF_MS = 2_000;
const EXHAUSTION_WAIT_MS = 100_000;
const PINO_ERROR_LEVEL = 50;
const MAIL_ATTEMPTS = MAIL_JOB_OPTIONS.attempts ?? 1;
const REGISTER = '/api/v1/auth/register';
const RESEND = '/api/v1/auth/resend-verification';
const COOLDOWN_MS = (EMAIL_REQUEST_COOLDOWN_SECONDS + 1) * 1000;
const SHORT_BACKOFF: ProviderOverride = {
  provide: MAIL_JOB_OPTIONS_TOKEN,
  useValue: { ...MAIL_JOB_OPTIONS, backoff: { type: 'exponential', delay: SHORT_BACKOFF_MS } },
};

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
      accessTokenStrategy: 'identity',
      env: { SMTP_PORT: String(smtpPort) },
      modules: [NotificationsModule, NotificationsWorkerModule],
      overrides: [SHORT_BACKOFF],
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

interface AccountRow {
  readonly id: string;
  readonly rol: string;
  readonly correo_verificado: boolean;
}

/**
 * Degradación del SMTP en el registro (CA-21 con CA-1 y CA-13): la composición de `identity` de `AppModule` más el
 * `worker` de `notifications`, apuntando a un puerto sin servidor. Es la de `identity-test-app.ts` con el SMTP y el
 * reloj sustituidos. Las pruebas corren en orden: la segunda levanta el Mailpit tardío que usa la tercera.
 */
describe('registro con el SMTP caído (CA-21, CA-13)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;
  let smtpPort = 0;
  let lateMailpit: StartedTestContainer | undefined;
  const clock = new FixedClock(new Date());
  const exhaustedEmail = `ana-${randomUUID()}@ejemplo.com`;

  const register = (email: string): Promise<Response> =>
    request(testApp.app.getHttpServer()).post(REGISTER).send(validRegistration(email));

  const accountOf = async (email: string): Promise<AccountRow> => {
    const [row] = (await dataSource.query(
      'SELECT id, rol, correo_verificado FROM usuario WHERE correo = $1',
      [email],
    )) as AccountRow[];
    if (row === undefined) throw new Error('La cuenta no quedó creada.');
    return row;
  };

  const activeTokenIdsOf = async (userId: string): Promise<string[]> => {
    const rows = (await dataSource.query(
      `SELECT id FROM token_cuenta
        WHERE usuario_id = $1 AND tipo = 'verificacion' AND usado_en IS NULL AND invalidado_en IS NULL`,
      [userId],
    )) as { id: string }[];
    return rows.map((row) => row.id);
  };

  const lateMailpitMessagesTo = async (email: string): Promise<number> => {
    if (lateMailpit === undefined) throw new Error('El Mailpit tardío no está arriba.');
    const messages = await listMessages(mailpitApiUrl(lateMailpit));
    return messages.filter((message) => message.To.some((to) => to.Address === email)).length;
  };

  beforeAll(async () => {
    smtpPort = await freePort();
    testApp = await createTestApp({
      withWorkerEnv: true,
      accessTokenStrategy: 'identity',
      env: { SMTP_PORT: String(smtpPort) },
      modules: [
        EventEmitterModule.forRoot(),
        ThrottlerModule.forRoot({ throttlers: [...IDENTITY_THROTTLERS] }),
        NotificationsWorkerModule,
        IdentityModule.forRoot(buildTestEnv()),
      ],
      overrides: [SHORT_BACKOFF, { provide: I_CLOCK, useValue: clock }],
    });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
    await lateMailpit?.stop();
  });

  it('CA-21: responde como CA-1, crea la cuenta y, con los intentos agotados, `mail.failed` lleva el `correlationId` de la petición y el id de la cuenta', async () => {
    const response = await register(exhaustedEmail);

    expect(response.status).toBe(202);
    expect(acceptedResponseSchema.parse(response.body)).toEqual({ status: 'accepted' });
    const account = await accountOf(exhaustedEmail);
    expect(account).toMatchObject({ rol: 'CLIENT', correo_verificado: false });
    await expect(activeTokenIdsOf(account.id)).resolves.toHaveLength(1);
    const failed = await waitForLog(
      testApp.logs,
      (line) => line.event === 'mail.failed' && line.recipientId === account.id,
      EXHAUSTION_WAIT_MS,
    );
    expect(failed).toMatchObject({
      level: PINO_ERROR_LEVEL,
      correlationId: response.headers['x-correlation-id'],
      tag: 'identity.verification',
      attemptsMade: MAIL_ATTEMPTS,
    });
  });

  it('CA-21: si el servidor vuelve antes de agotar los intentos llega un solo correo del registro', async () => {
    const email = `luis-${randomUUID()}@ejemplo.com`;

    expect((await register(email)).status).toBe(202);
    const account = await accountOf(email);
    await waitForLog(
      testApp.logs,
      (line) => line.event === 'mail.retry_scheduled' && line.recipientId === account.id,
    );
    lateMailpit = await startMailpit({ smtpHostPort: smtpPort });

    await waitForLog(
      testApp.logs,
      (line) => line.event === 'mail.sent' && line.recipientId === account.id,
      EXHAUSTION_WAIT_MS,
    );
    await expect(lateMailpitMessagesTo(email)).resolves.toBe(1);
  });

  it('CA-21, CA-13: tras agotar los intentos, la persona pide otro enlace y le llega', async () => {
    const account = await accountOf(exhaustedEmail);
    const [previous] = await activeTokenIdsOf(account.id);
    clock.advance(COOLDOWN_MS);

    await request(testApp.app.getHttpServer())
      .post(RESEND)
      .send({ email: exhaustedEmail })
      .expect(202);

    const current = await activeTokenIdsOf(account.id);
    expect(current).toHaveLength(1);
    expect(current[0]).not.toBe(previous);
    await waitForLog(
      testApp.logs,
      (line) =>
        line.event === 'mail.sent' && line.jobId === `identity.verification.${String(current[0])}`,
    );
    await expect(lateMailpitMessagesTo(exhaustedEmail)).resolves.toBe(1);
  });
});
