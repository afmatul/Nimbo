import { escapeHtml } from './escape-html';
import { formatGuatemalaDateTime } from './guatemala-date.format';
import { button, link, mailDocument, mutedParagraph, paragraph } from './mail-layout';
import type { MailContent } from './mail-layout';

export interface RegistrationAttemptMailInput {
  readonly attemptedAt: Date;
  readonly loginUrl: string;
  readonly passwordRecoveryUrl: string;
}

const SUBJECT = 'Alguien intentó crear una cuenta con tu correo';
const TITLE = 'Alguien intentó registrarse con tu correo';
const IF_YOU = 'Si fuiste tú, entra con tu cuenta actual.';
const FORGOT = '¿Olvidaste tu contraseña? Restablécela aquí:';
const NOT_YOU =
  'Si no fuiste tú, no tienes que hacer nada. Nadie puede entrar a tu cuenta sin tu contraseña.';
const FREQUENCY = 'Enviamos este aviso como máximo una vez cada 24 horas.';

/** «El 23/09/2026 a las 10:14 (hora de Guatemala) …». */
const attemptSentence = (attemptedAt: Date): string => {
  const { date, time } = formatGuatemalaDateTime(attemptedAt);
  return (
    `El ${date} a las ${time} (hora de Guatemala) alguien intentó crear una cuenta de Nimbo con tu correo. ` +
    'Esa dirección ya tiene una cuenta, así que no creamos otra.'
  );
};

/** Aviso al dueño de una cuenta existente (D-17, CA-2): solo la fecha del intento, sin datos de quien lo hizo. */
export const registrationAttemptMail = ({
  attemptedAt,
  loginUrl,
  passwordRecoveryUrl,
}: RegistrationAttemptMailInput): MailContent => {
  const attempt = attemptSentence(attemptedAt);
  return {
    subject: SUBJECT,
    text: [
      attempt,
      '',
      `${IF_YOU} ${loginUrl}`,
      '',
      `${FORGOT} ${passwordRecoveryUrl}`,
      '',
      NOT_YOU,
      '',
      FREQUENCY,
    ].join('\n'),
    html: mailDocument(TITLE, [
      paragraph(attempt),
      paragraph(IF_YOU),
      button('Iniciar sesión', loginUrl),
      mutedParagraph(
        `${escapeHtml(FORGOT)} ${link('Restablecer contraseña', passwordRecoveryUrl)}`,
      ),
      paragraph(NOT_YOU),
      mutedParagraph(escapeHtml(FREQUENCY)),
    ]),
  };
};
