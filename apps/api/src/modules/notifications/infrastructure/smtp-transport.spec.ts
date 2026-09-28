import { createServer } from 'node:net';
import type { AddressInfo, Server, Socket } from 'node:net';

import type { MailMessage } from '../application/ports/i-mailer.port';

import { SmtpTransport } from './smtp-transport';
import type { SmtpEnv } from './smtp-transport';

const JOB_ID = 'identity.verification.5f0c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';

const message: MailMessage = {
  to: 'ana@ejemplo.com',
  subject: 'Verifica tu correo',
  text: 'Texto del correo',
  html: '<p>HTML del correo</p>',
  idempotencyKey: JOB_ID,
  tag: 'identity.verification',
};

interface FakeSmtp {
  readonly port: number;
  readonly commands: string[];
  readonly data: string[];
  close(): Promise<void>;
}

/** Servidor SMTP mínimo que anuncia STARTTLS (sin soportarlo) y guarda los comandos y el contenido recibidos. */
const startFakeSmtp = async (): Promise<FakeSmtp> => {
  const commands: string[] = [];
  const data: string[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    let buffer = '';
    let inData = false;
    socket.write('220 fake ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (inData) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;
        data.push(buffer.slice(0, end));
        buffer = buffer.slice(end + 5);
        inData = false;
        socket.write('250 OK queued\r\n');
      }
      let newline = buffer.indexOf('\r\n');
      while (!inData && newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        commands.push(line.split(' ')[0]?.toUpperCase() ?? '');
        if (/^EHLO/i.test(line)) socket.write('250-fake\r\n250-STARTTLS\r\n250 8BITMIME\r\n');
        else if (/^STARTTLS/i.test(line)) socket.write('454 TLS not available\r\n');
        else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write('354 go ahead\r\n');
        } else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
        newline = buffer.indexOf('\r\n');
      }
    });
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    commands,
    data,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => {
          resolve();
        });
      }),
  };
};

const freePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

const envFor = (port: number, tls: SmtpEnv['SMTP_TLS'] = 'none'): SmtpEnv => ({
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: port,
  SMTP_TLS: tls,
  MAIL_FROM: 'Nimbo <no-responder@nimbo.me>',
});

describe('SmtpTransport', () => {
  let smtp: FakeSmtp;

  beforeEach(async () => {
    smtp = await startFakeSmtp();
  });

  afterEach(async () => {
    await smtp.close();
  });

  it('CA-21: entrega con `MAIL_FROM`, texto, HTML y `Message-ID = <jobId@nimbo.me>`', async () => {
    await new SmtpTransport(envFor(smtp.port)).deliver(message, JOB_ID);

    // Las cabeceras largas llegan plegadas (RFC 5322): se despliegan antes de comparar.
    const raw = smtp.data.join('\n').replace(/\r\n[ \t]+/g, ' ');
    expect(raw).toContain(`\r\nMessage-ID: <${JOB_ID}@nimbo.me>\r\n`);
    expect(raw).toMatch(/^From: Nimbo <no-responder@nimbo\.me>/m);
    expect(raw).toMatch(/^To: ana@ejemplo\.com/m);
    expect(raw).toContain('Texto del correo');
    expect(raw).toContain('<p>HTML del correo</p>');
  });

  it('CA-21: con `SMTP_TLS=none` no intenta STARTTLS aunque el servidor lo anuncie', async () => {
    await new SmtpTransport(envFor(smtp.port, 'none')).deliver(message, JOB_ID);

    expect(smtp.commands).not.toContain('STARTTLS');
  });

  it('CA-21: con `SMTP_TLS=starttls` exige STARTTLS y falla si el servidor no lo completa', async () => {
    await expect(
      new SmtpTransport(envFor(smtp.port, 'starttls')).deliver(message, JOB_ID),
    ).rejects.toMatchObject({ code: expect.any(String) });

    expect(smtp.commands).toContain('STARTTLS');
    expect(smtp.data).toHaveLength(0);
  });

  it('CA-21: un puerto cerrado rechaza con un error que conserva `code`', async () => {
    const closed = await freePort();

    await expect(new SmtpTransport(envFor(closed)).deliver(message, JOB_ID)).rejects.toMatchObject({
      code: expect.any(String),
    });
  });
});
