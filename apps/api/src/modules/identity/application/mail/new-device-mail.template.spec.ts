import { newDeviceMail } from './new-device-mail.template';

const SECURITY_URL = 'http://localhost/cuenta/seguridad';
// 02:30 UTC del 27/09 = 20:30 del 26/09 en Guatemala.
const SIGNED_IN_AT = new Date('2026-09-27T02:30:00.000Z');

describe('newDeviceMail (spec §11, CA-16)', () => {
  const mail = newDeviceMail({
    signedInAt: SIGNED_IN_AT,
    browser: 'Firefox',
    os: 'Linux',
    securityUrl: SECURITY_URL,
  });

  it('CA-16: usa el asunto «Nuevo inicio de sesión en Nimbo»', () => {
    expect(mail.subject).toBe('Nuevo inicio de sesión en Nimbo');
  });

  it.each(['text', 'html'] as const)(
    'CA-16: el %s da navegador, sistema, fecha y hora de Guatemala y el enlace a Seguridad',
    (part) => {
      const body = mail[part];

      expect(body).toContain(
        'Alguien inició sesión en tu cuenta el 26/09/2026 a las 20:30 (hora de Guatemala) desde Firefox en Linux.',
      );
      expect(body).toContain('Si fuiste tú, no tienes que hacer nada.');
      expect(body).toContain('Si no, cambia tu contraseña y cierra esa sesión desde Seguridad.');
      expect(body).toContain(SECURITY_URL);
    },
  );

  it('CA-16: no recibe la IP ni el agente de usuario completo, así que no puede incluirlos', () => {
    const everything = `${mail.subject}\n${mail.text}\n${mail.html}`;

    expect(everything).not.toMatch(/\bIP\b/);
    expect(everything).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    expect(everything).not.toContain('Mozilla/');
  });

  it('CA-16: el HTML usa estilos en línea y escapa lo que recibe', () => {
    const tricky = newDeviceMail({
      signedInAt: SIGNED_IN_AT,
      browser: '<b>Edge</b>',
      os: 'Windows',
      securityUrl: 'http://localhost/cuenta/seguridad?a=1&b="x"',
    });

    expect(tricky.html).toContain('style="');
    expect(tricky.html).not.toMatch(/<style|<script|<b>/i);
    expect(tricky.html).toContain('&lt;b&gt;Edge&lt;/b&gt;');
    expect(tricky.html).toContain(
      'href="http://localhost/cuenta/seguridad?a=1&amp;b=&quot;x&quot;"',
    );
  });
});
