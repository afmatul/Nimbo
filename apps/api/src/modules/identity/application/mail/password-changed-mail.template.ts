import { escapeHtml } from './escape-html';
import { formatGuatemalaDateTime } from './guatemala-date.format';
import { button, link, mailDocument, mutedParagraph, paragraph } from './mail-layout';
import type { MailContent } from './mail-layout';

export interface PasswordChangedMailInput {
  readonly changedAt: Date;
  /** `{WEB_PUBLIC_URL}/recuperar-contrasena`. */
  readonly passwordRecoveryUrl: string;
}

const SUBJECT = 'Tu contraseña de Nimbo cambió';
const NOT_YOU = 'Si no fuiste tú, restablécela ahora:';
const FALLBACK = '¿El botón no funciona? Copia este enlace en tu navegador:';

/**
 * Aviso de contraseña cambiada, al restablecerla (CA-19) o al cambiarla estando dentro (CA-22). Sin IP (D-9) y, por
 * supuesto, sin la contraseña.
 */
export const passwordChangedMail = ({
  changedAt,
  passwordRecoveryUrl,
}: PasswordChangedMailInput): MailContent => {
  const { date, time } = formatGuatemalaDateTime(changedAt);
  const sentence = `Tu contraseña de Nimbo cambió el ${date} a las ${time} (hora de Guatemala).`;
  return {
    subject: SUBJECT,
    text: [sentence, '', `${NOT_YOU} ${passwordRecoveryUrl}`].join('\n'),
    html: mailDocument(SUBJECT, [
      paragraph(sentence),
      paragraph(NOT_YOU),
      button('Restablecer contraseña', passwordRecoveryUrl),
      mutedParagraph(
        `${escapeHtml(FALLBACK)}<br>${link(passwordRecoveryUrl, passwordRecoveryUrl)}`,
      ),
    ]),
  };
};
