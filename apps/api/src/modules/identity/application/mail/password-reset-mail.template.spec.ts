import { passwordResetMail } from './password-reset-mail.template';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE';
const URL = `http://localhost/restablecer-contrasena#token=${TOKEN}`;

describe('passwordResetMail (spec §11, CA-18)', () => {
  const mail = passwordResetMail({ resetUrl: URL });

  it('CA-18: usa el asunto «Restablece tu contraseña de Nimbo»', () => {
    expect(mail.subject).toBe('Restablece tu contraseña de Nimbo');
  });

  it.each(['text', 'html'] as const)(
    'CA-18: el %s trae el enlace, la vigencia de 1 hora, el único uso, el cierre de sesiones y qué hacer si no lo pediste',
    (part) => {
      const body = mail[part];

      expect(body).toContain(URL);
      expect(body).toContain('Abre este enlace para elegir una contraseña nueva');
      expect(body).toContain('Vence en 1 hora y solo funciona una vez.');
      expect(body).toContain('Al cambiarla cerraremos todas tus sesiones.');
      expect(body).toContain('Si no lo pediste, ignora este mensaje: tu contraseña no cambia.');
    },
  );

  it('CA-18: no recibe la IP ni datos de la cuenta, así que no puede incluirlos', () => {
    const everything = `${mail.subject}\n${mail.text}\n${mail.html}`;

    expect(everything).not.toMatch(/\bIP\b/);
    expect(everything).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    expect(everything).not.toContain('@');
  });

  it('CA-18: el HTML usa estilos en línea y escapa el enlace', () => {
    const tricky = passwordResetMail({
      resetUrl: 'http://localhost/restablecer-contrasena#token=a"><script>&b',
    });

    expect(tricky.html).toContain('style="');
    expect(tricky.html).not.toMatch(/<style|<link|<script/i);
    expect(tricky.html).toContain(
      'href="http://localhost/restablecer-contrasena#token=a&quot;&gt;&lt;script&gt;&amp;b"',
    );
  });
});
