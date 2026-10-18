import type { IMailer, MailMessage } from '../application/ports/i-mailer.port';

import { MailNotifier } from './mail-notifier';

const MESSAGE: MailMessage = {
  to: 'ana@ejemplo.com',
  subject: 'Comprobante de pago',
  text: 'texto',
  html: '<p>texto</p>',
  idempotencyKey: 'billing.receipt.11111111-1111-4111-8111-111111111111',
  tag: 'billing.receipt',
  recipientId: '22222222-2222-4222-8222-222222222222',
};

describe('MailNotifier (spec 009 CA-6; decisión 4)', () => {
  it('CA-6: el único canal es el correo: encola el mismo mensaje por la cola `mail`', async () => {
    const mailer: IMailer = { send: jest.fn().mockResolvedValue(undefined) };

    await new MailNotifier(mailer).notify(MESSAGE);

    expect(mailer.send).toHaveBeenCalledWith(MESSAGE);
  });
});
