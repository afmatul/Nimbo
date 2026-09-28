import { escapeHtml } from './escape-html';
import { button, link, mailDocument, mutedParagraph, paragraph } from './mail-layout';
import type { MailContent } from './mail-layout';

export interface RegistrationAttemptMailInput {
  readonly attemptedAt: Date;
  readonly loginUrl: string;
  readonly passwordRecoveryUrl: string;
}

const SUBJECT = 'Alguien intentó crear una cuenta con tu correo';
const TITLE = 'Alguien intentó registrarse con tu correo';
const GUATEMALA_TIME_ZONE = 'America/Guatemala';
const IF_YOU = 'Si fuiste tú, entra con tu cuenta actual.';
const FORGOT = '¿Olvidaste tu contraseña? Restablécela aquí:';
const NOT_YOU =
  'Si no fuiste tú, no tienes que hacer nada. Nadie puede entrar a tu cuenta sin tu contraseña.';
const FREQUENCY = 'Enviamos este aviso como máximo una vez cada 24 horas.';

const guatemalaFormat = new Intl.DateTimeFormat('es-GT', {
  timeZone: GUATEMALA_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** «El 23/09/2026 a las 10:14 (hora de Guatemala) …», armado por partes para no depender del patrón de la ICU. */
const attemptSentence = (attemptedAt: Date): string => {
  const parts = new Map(
    guatemalaFormat.formatToParts(attemptedAt).map((part) => [part.type, part.value]),
  );
  const date = `${parts.get('day') ?? ''}/${parts.get('month') ?? ''}/${parts.get('year') ?? ''}`;
  const time = `${parts.get('hour') ?? ''}:${parts.get('minute') ?? ''}`;
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
