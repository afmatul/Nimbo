import { registrationAttemptMail } from './registration-attempt-mail.template';

const LOGIN_URL = 'http://localhost/iniciar-sesion';
const RECOVERY_URL = 'http://localhost/recuperar-contrasena';
// 16:14 UTC = 10:14 en Guatemala (UTC-6, sin horario de verano).
const ATTEMPTED_AT = new Date('2026-09-23T16:14:00.000Z');

describe('registrationAttemptMail (D-17, RN-10)', () => {
  const mail = registrationAttemptMail({
    attemptedAt: ATTEMPTED_AT,
    loginUrl: LOGIN_URL,
    passwordRecoveryUrl: RECOVERY_URL,
  });

  it('CA-2: usa el asunto del aviso de intento', () => {
    expect(mail.subject).toBe('Alguien intentó crear una cuenta con tu correo');
  });

  it.each(['text', 'html'] as const)(
    'CA-2: el %s da la fecha del intento en hora de Guatemala y enlaza a iniciar sesión y a recuperar la contraseña',
    (part) => {
      const body = mail[part];

      expect(body).toContain('El 23/09/2026 a las 10:14 (hora de Guatemala)');
      expect(body).toContain(LOGIN_URL);
      expect(body).toContain(RECOVERY_URL);
      expect(body).toContain('no creamos otra');
    },
  );

  it('CA-2: la hora de Guatemala no depende de la zona del servidor ni cambia de día al cruzar la medianoche UTC', () => {
    const lateNight = registrationAttemptMail({
      attemptedAt: new Date('2026-09-24T03:30:00.000Z'),
      loginUrl: LOGIN_URL,
      passwordRecoveryUrl: RECOVERY_URL,
    });

    expect(lateNight.text).toContain('El 23/09/2026 a las 21:30 (hora de Guatemala)');
  });

  it('CA-2: no incluye datos de quien lo intentó (IP, nombre ni correo)', () => {
    const everything = `${mail.subject}\n${mail.text}\n${mail.html}`;

    expect(everything).not.toMatch(/\bIP\b/);
    expect(everything).not.toMatch(/@/);
    expect(everything).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
  });

  it('CA-2: el HTML usa estilos en línea y escapa los enlaces', () => {
    const tricky = registrationAttemptMail({
      attemptedAt: ATTEMPTED_AT,
      loginUrl: 'http://localhost/iniciar-sesion?a=1&b="x"',
      passwordRecoveryUrl: RECOVERY_URL,
    });

    expect(tricky.html).toContain('style="');
    expect(tricky.html).not.toMatch(/<style|<script/i);
    expect(tricky.html).toContain('href="http://localhost/iniciar-sesion?a=1&amp;b=&quot;x&quot;"');
  });
});
