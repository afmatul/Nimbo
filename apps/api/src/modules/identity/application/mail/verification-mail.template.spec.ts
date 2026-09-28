import { verificationMail } from './verification-mail.template';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE';
const URL = `http://localhost/verificar-correo#token=${TOKEN}`;

describe('verificationMail (spec §11, RN-9)', () => {
  const mail = verificationMail({ verificationUrl: URL });

  it('CA-1: usa el asunto de verificación', () => {
    expect(mail.subject).toBe('Verifica tu correo para entrar a Nimbo');
  });

  it.each(['text', 'html'] as const)(
    'CA-1: el %s trae el enlace, la vigencia, el único uso, la advertencia y qué hacer si no fuiste tú',
    (part) => {
      const body = mail[part];

      expect(body).toContain(URL);
      expect(body).toContain('24 horas');
      expect(body).toContain('solo funciona una vez');
      expect(body).toContain('No reenvíes este correo: quien abra el enlace entrará a tu cuenta');
      expect(body).toContain('Si no creaste una cuenta en Nimbo, ignora este mensaje.');
    },
  );

  it('CA-1: no recibe la contraseña ni datos de la cuenta, así que no puede incluirlos', () => {
    expect(Object.keys(mail).sort()).toEqual(['html', 'subject', 'text']);
    expect(`${mail.text}\n${mail.html}`).not.toMatch(/contraseña|@/i);
  });

  it('CA-1: el HTML usa estilos en línea, sin hojas de estilo ni scripts', () => {
    expect(mail.html).toContain('style="');
    expect(mail.html).not.toMatch(/<style|<link|<script/i);
  });

  it('CA-1: el HTML escapa el enlace en el atributo y en el texto', () => {
    const tricky = verificationMail({
      verificationUrl: 'http://localhost/verificar-correo#token=a"><script>&b',
    });

    expect(tricky.html).not.toContain('"><script>');
    expect(tricky.html).toContain(
      'href="http://localhost/verificar-correo#token=a&quot;&gt;&lt;script&gt;&amp;b"',
    );
  });
});
