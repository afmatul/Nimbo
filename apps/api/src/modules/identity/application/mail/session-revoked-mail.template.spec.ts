import { sessionRevokedMail } from './session-revoked-mail.template';

const SECURITY_URL = 'http://localhost/cuenta/seguridad';
const RECOVERY_URL = 'http://localhost/recuperar-contrasena';
// 16:14 UTC = 10:14 en Guatemala.
const REVOKED_AT = new Date('2026-09-23T16:14:00.000Z');

describe('sessionRevokedMail (spec §11, CA-9)', () => {
  const mail = sessionRevokedMail({
    revokedAt: REVOKED_AT,
    browser: 'Chrome',
    os: 'Android',
    securityUrl: SECURITY_URL,
    passwordRecoveryUrl: RECOVERY_URL,
  });

  it('CA-9: usa el asunto «Cerramos una sesión por seguridad»', () => {
    expect(mail.subject).toBe('Cerramos una sesión por seguridad');
  });

  it.each(['text', 'html'] as const)(
    'CA-9: el %s nombra el dispositivo, la fecha de Guatemala y enlaza a Seguridad y a recuperar la contraseña',
    (part) => {
      const body = mail[part];

      expect(body).toContain(
        'Cerramos una sesión de tu cuenta (Chrome · Android) porque sus credenciales se usaron de forma sospechosa.',
      );
      expect(body).toContain('Ocurrió el 23/09/2026 a las 10:14 (hora de Guatemala).');
      expect(body).toContain('Si no reconoces la actividad, cambia tu contraseña.');
      expect(body).toContain(SECURITY_URL);
      expect(body).toContain(RECOVERY_URL);
    },
  );

  it('CA-9: no incluye la IP', () => {
    const everything = `${mail.subject}\n${mail.text}\n${mail.html}`;

    expect(everything).not.toMatch(/\bIP\b/);
    expect(everything).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
  });

  it('CA-9: el HTML usa estilos en línea y escapa lo que recibe', () => {
    const tricky = sessionRevokedMail({
      revokedAt: REVOKED_AT,
      browser: '<i>Opera</i>',
      os: 'Windows',
      securityUrl: SECURITY_URL,
      passwordRecoveryUrl: 'http://localhost/recuperar-contrasena?a=1&b=2',
    });

    expect(tricky.html).toContain('style="');
    expect(tricky.html).not.toMatch(/<style|<script|<i>/i);
    expect(tricky.html).toContain('&lt;i&gt;Opera&lt;/i&gt;');
    expect(tricky.html).toContain('href="http://localhost/recuperar-contrasena?a=1&amp;b=2"');
  });
});
