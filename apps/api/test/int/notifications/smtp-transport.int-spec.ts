import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

import type { MailMessage } from '../../../src/modules/notifications';
import { SmtpTransport } from '../../../src/modules/notifications/infrastructure/smtp-transport';
import { deleteAll, getMessage, waitForMessages } from '../setup/mailpit';
import { buildTestEnv } from '../setup/test-app';

const JOB_ID = 'identity.verification.5f0c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';

const message: MailMessage = {
  to: 'ana.lopez@ejemplo.com',
  subject: 'Verifica tu correo para entrar a Nimbo',
  text: 'Abre este enlace para verificar tu correo.',
  html: '<p>Abre <a href="http://localhost/verificar-correo#token=abc">este enlace</a>.</p>',
  idempotencyKey: JOB_ID,
  tag: 'identity.verification',
};

const freePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

/** Contra el Mailpit real del arnés (CA-1: el correo llega a Mailpit; CA-21: `Message-ID` determinista). */
describe('SmtpTransport contra Mailpit (CA-1, CA-21)', () => {
  const env = buildTestEnv({}, { withWorkerEnv: true });

  beforeEach(async () => {
    await deleteAll();
  });

  it('CA-1: entrega a Mailpit con `MAIL_FROM`, destinatario, asunto, texto y HTML', async () => {
    await new SmtpTransport(env).deliver(message, JOB_ID);

    const [summary] = await waitForMessages(1);
    const received = await getMessage(summary?.ID ?? '');
    expect(received.From.Address).toBe('no-responder@nimbo.me');
    expect(received.To.map((to) => to.Address)).toEqual([message.to]);
    expect(received.Subject).toBe(message.subject);
    expect(received.Text).toContain('Abre este enlace para verificar tu correo.');
    expect(received.HTML).toContain('http://localhost/verificar-correo#token=abc');
  });

  it('CA-21: `Message-ID = <jobId@nimbo.me>`', async () => {
    await new SmtpTransport(env).deliver(message, JOB_ID);

    const [summary] = await waitForMessages(1);
    expect(summary?.MessageID).toBe(`${JOB_ID}@nimbo.me`);
  });

  it('CA-21: con `SMTP_TLS=none` entrega sin TLS (Mailpit del arnés no lo ofrece)', async () => {
    expect(env.SMTP_TLS).toBe('none');

    await expect(new SmtpTransport(env).deliver(message, JOB_ID)).resolves.toBeUndefined();
  });

  it('CA-21: un puerto cerrado rechaza con un error que conserva `code`', async () => {
    const closed = { ...env, SMTP_HOST: '127.0.0.1', SMTP_PORT: await freePort() };

    await expect(new SmtpTransport(closed).deliver(message, JOB_ID)).rejects.toMatchObject({
      code: expect.any(String),
    });
  });
});
