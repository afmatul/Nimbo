import { passwordChangedMail } from './password-changed-mail.template';

const RECOVERY_URL = 'http://localhost/recuperar-contrasena';
// 02:30 UTC del 01/10 = 20:30 del 30/09 en Guatemala.
const CHANGED_AT = new Date('2026-10-01T02:30:00.000Z');

describe('passwordChangedMail (spec §11, CA-19, CA-22)', () => {
  const mail = passwordChangedMail({ changedAt: CHANGED_AT, passwordRecoveryUrl: RECOVERY_URL });

  it('CA-19: usa el asunto «Tu contraseña de Nimbo cambió»', () => {
    expect(mail.subject).toBe('Tu contraseña de Nimbo cambió');
  });

  it.each(['text', 'html'] as const)(
    'CA-19: el %s da la fecha y hora de Guatemala y el enlace para restablecerla si no fuiste tú',
    (part) => {
      const body = mail[part];

      expect(body).toContain(
        'Tu contraseña de Nimbo cambió el 30/09/2026 a las 20:30 (hora de Guatemala).',
      );
      expect(body).toContain('Si no fuiste tú, restablécela ahora');
      expect(body).toContain(RECOVERY_URL);
    },
  );

  it('CA-22: no recibe la IP ni la contraseña, así que no puede incluirlas', () => {
    const everything = `${mail.subject}\n${mail.text}\n${mail.html}`;

    expect(everything).not.toMatch(/\bIP\b/);
    expect(everything).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
  });

  it('CA-19: el HTML usa estilos en línea y escapa el enlace', () => {
    const tricky = passwordChangedMail({
      changedAt: CHANGED_AT,
      passwordRecoveryUrl: 'http://localhost/recuperar-contrasena?a=1&b="x"',
    });

    expect(tricky.html).toContain('style="');
    expect(tricky.html).not.toMatch(/<style|<link|<script/i);
    expect(tricky.html).toContain(
      'href="http://localhost/recuperar-contrasena?a=1&amp;b=&quot;x&quot;"',
    );
  });
});
