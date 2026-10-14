import { internalInvitationMail } from './internal-invitation-mail.template';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE';
const URL = `http://localhost/crear-contrasena#token=${TOKEN}`;

describe('internalInvitationMail (011 CA-5)', () => {
  const mail = internalInvitationMail({ setupUrl: URL });

  it('CA-5: usa el asunto «Crea tu contraseña de Nimbo»', () => {
    expect(mail.subject).toBe('Crea tu contraseña de Nimbo');
  });

  it.each(['text', 'html'] as const)(
    'CA-5: el %s trae el enlace, la vigencia de 24 horas, el único uso y qué hacer si vence',
    (part) => {
      const body = mail[part];

      expect(body).toContain(URL);
      expect(body).toContain('Abre este enlace para crear tu contraseña.');
      expect(body).toContain('Vence en 24 horas y solo funciona una vez.');
      expect(body).toContain('¿Olvidaste tu contraseña?');
    },
  );

  it('CA-5: el token solo aparece en el fragmento del enlace', () => {
    const everything = `${mail.subject}\n${mail.text}\n${mail.html}`;
    const occurrences = everything.split(TOKEN).length - 1;
    const inFragment = everything.split(`#token=${TOKEN}`).length - 1;

    expect(occurrences).toBeGreaterThan(0);
    expect(inFragment).toBe(occurrences);
    expect(everything).not.toContain(`?token=`);
  });

  it('CA-5: el HTML usa estilos en línea y escapa el enlace', () => {
    const tricky = internalInvitationMail({
      setupUrl: 'http://localhost/crear-contrasena#token=a"><script>&b',
    });

    expect(tricky.html).toContain('style="');
    expect(tricky.html).not.toMatch(/<style|<link|<script/i);
    expect(tricky.html).toContain(
      'href="http://localhost/crear-contrasena#token=a&quot;&gt;&lt;script&gt;&amp;b"',
    );
  });
});
