import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';

import { CorrelationContext } from '../../../shared';

import { MAIL_JOB_OPTIONS } from './mail-queue';
import type { MailJobData } from './mail-queue';
import { MailProcessor } from './mail.processor';
import type { SmtpTransport } from './smtp-transport';

const JOB_ID = 'identity.verification.5f0c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const MARKER = `mail:sent:${JOB_ID}`;
const RECIPIENT = 'ana.lopez@ejemplo.com';
const SUBJECT = 'Verifica tu correo para entrar a Nimbo';
const LINK = 'http://localhost/verificar-correo#token=secreto';
const SMTP_MESSAGE = `Can't send mail - all recipients were rejected: 550 <${RECIPIENT}>`;

const data: MailJobData = {
  to: RECIPIENT,
  subject: SUBJECT,
  text: `Abre ${LINK}`,
  html: `<a href="${LINK}">Verificar</a>`,
  idempotencyKey: JOB_ID,
  tag: 'identity.verification',
  recipientId: 'user-1',
  correlationId: 'corr-peticion',
};

interface LoggedLine {
  readonly level: 'info' | 'warn' | 'error';
  readonly payload: Record<string, unknown>;
  readonly correlationId: string | undefined;
  readonly jobId: string | undefined;
}

const jobWith = (attemptsMade: number): Job<MailJobData> =>
  ({
    id: JOB_ID,
    data,
    attemptsMade,
    opts: { ...MAIL_JOB_OPTIONS, jobId: JOB_ID },
  }) as unknown as Job<MailJobData>;

const smtpError = (): Error =>
  Object.assign(new Error(SMTP_MESSAGE), { code: 'EENVELOPE', responseCode: 550 });

const setup = (options: { marked?: boolean; deliver?: jest.Mock } = {}) => {
  const lines: LoggedLine[] = [];
  const record =
    (level: LoggedLine['level']) =>
    (payload: Record<string, unknown>): void => {
      const store = CorrelationContext.get();
      lines.push({ level, payload, correlationId: store?.correlationId, jobId: store?.jobId });
    };
  const logger = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  } as unknown as PinoLogger;
  const markers = new Set<string>(options.marked === true ? [MARKER] : []);
  const set = jest.fn((key: string) => {
    markers.add(key);
    return Promise.resolve('OK');
  });
  const redis = {
    exists: jest.fn((key: string) => Promise.resolve(markers.has(key) ? 1 : 0)),
    set,
  } as unknown as Redis;
  const deliver = options.deliver ?? jest.fn().mockResolvedValue(undefined);
  const transport = { deliver } as unknown as SmtpTransport;
  return { processor: new MailProcessor(transport, redis, logger), lines, deliver, set };
};

const expectNoSensitiveData = (lines: readonly LoggedLine[]): void => {
  const serialized = JSON.stringify(lines);
  for (const forbidden of [RECIPIENT, SUBJECT, LINK, SMTP_MESSAGE, 'Verificar', '"to"', '"text"']) {
    expect(serialized).not.toContain(forbidden);
  }
};

describe('MailProcessor', () => {
  it('CA-18: corre dentro de `CorrelationContext` con el `correlationId` del trabajo y su `jobId`', async () => {
    const { processor, lines } = setup();

    await processor.process(jobWith(0));

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatchObject({ correlationId: 'corr-peticion', jobId: JOB_ID });
    }
  });

  it('CA-21: sin marca entrega con `Message-ID` del `jobId`, escribe la marca con `SET NX EX 604800` y registra `mail.sent`', async () => {
    const { processor, lines, deliver, set } = setup();

    await processor.process(jobWith(0));

    expect(deliver).toHaveBeenCalledWith(data, JOB_ID);
    expect(set).toHaveBeenCalledWith(MARKER, '1', 'EX', 604800, 'NX');
    expect(lines.map((line) => line.payload)).toEqual([
      { event: 'mail.sent', tag: 'identity.verification', recipientId: 'user-1', attemptsMade: 1 },
    ]);
  });

  it('CA-21: con la marca ya escrita no entrega y registra `mail.duplicate_skipped`', async () => {
    const { processor, lines, deliver } = setup({ marked: true });

    await processor.process(jobWith(1));

    expect(deliver).not.toHaveBeenCalled();
    expect(lines.map((line) => line.payload)).toEqual([
      { event: 'mail.duplicate_skipped', tag: 'identity.verification', jobId: JOB_ID },
    ]);
  });

  it('CA-21: si el transporte falla relanza, no escribe la marca y registra `mail.retry_scheduled` con `errorCode` y `responseCode`', async () => {
    const error = smtpError();
    const { processor, lines, set } = setup({ deliver: jest.fn().mockRejectedValue(error) });

    await expect(processor.process(jobWith(0))).rejects.toBe(error);

    expect(set).not.toHaveBeenCalled();
    expect(lines).toEqual([
      expect.objectContaining({
        level: 'warn',
        payload: {
          event: 'mail.retry_scheduled',
          tag: 'identity.verification',
          recipientId: 'user-1',
          attemptsMade: 1,
          errorCode: 'EENVELOPE',
          responseCode: 550,
        },
      }),
    ]);
    expectNoSensitiveData(lines);
  });

  it('CA-21: en el último intento relanza sin anunciar un reintento', async () => {
    const { processor, lines } = setup({ deliver: jest.fn().mockRejectedValue(smtpError()) });

    await expect(processor.process(jobWith(5))).rejects.toThrow();

    expect(lines).toEqual([]);
  });

  it('CA-21: `failed` con los intentos agotados registra `mail.failed` en `error` con el mismo `correlationId`', () => {
    const { processor, lines } = setup();

    processor.onFailed(jobWith(6), smtpError());

    expect(lines).toEqual([
      {
        level: 'error',
        correlationId: 'corr-peticion',
        jobId: JOB_ID,
        payload: {
          event: 'mail.failed',
          tag: 'identity.verification',
          recipientId: 'user-1',
          attemptsMade: 6,
          errorCode: 'EENVELOPE',
          responseCode: 550,
        },
      },
    ]);
    expectNoSensitiveData(lines);
  });

  it('CA-21: `failed` con reintentos pendientes o sin trabajo no registra nada', () => {
    const { processor, lines } = setup();

    processor.onFailed(jobWith(3), smtpError());
    processor.onFailed(undefined, smtpError());

    expect(lines).toEqual([]);
  });

  it('CA-18: un error sin `code` se registra sin inventar el campo', () => {
    const { processor, lines } = setup();

    processor.onFailed(jobWith(6), new Error(SMTP_MESSAGE));

    expect(lines[0]?.payload).toEqual({
      event: 'mail.failed',
      tag: 'identity.verification',
      recipientId: 'user-1',
      attemptsMade: 6,
      errorCode: undefined,
      responseCode: undefined,
    });
    expectNoSensitiveData(lines);
  });
});
