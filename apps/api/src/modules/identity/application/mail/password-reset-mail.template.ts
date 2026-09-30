import { escapeHtml } from './escape-html';
import { button, link, mailDocument, mutedParagraph, paragraph } from './mail-layout';
import type { MailContent } from './mail-layout';

export interface PasswordResetMailInput {
  /** `{WEB_PUBLIC_URL}/restablecer-contrasena#token=<valor>`: el token va en el fragmento, como en 001. */
  readonly resetUrl: string;
}

const SUBJECT = 'Restablece tu contraseña de Nimbo';
const TITLE = 'Elige una contraseña nueva';
const INTRO = 'Abre este enlace para elegir una contraseña nueva.';
const VALIDITY = 'Vence en 1 hora y solo funciona una vez.';
const SESSIONS = 'Al cambiarla cerraremos todas tus sesiones.';
const NOT_YOU = 'Si no lo pediste, ignora este mensaje: tu contraseña no cambia.';
const FALLBACK = '¿El botón no funciona? Copia este enlace en tu navegador:';

/**
 * Correo con el enlace de recuperación (spec §11, CA-18, D-6). No saluda por nombre ni lleva la IP: lo pidió
 * alguien que escribió el correo y podría no ser el dueño del buzón.
 */
export const passwordResetMail = ({ resetUrl }: PasswordResetMailInput): MailContent => ({
  subject: SUBJECT,
  text: [INTRO, '', resetUrl, '', `${VALIDITY} ${SESSIONS}`, '', NOT_YOU].join('\n'),
  html: mailDocument(TITLE, [
    paragraph(INTRO),
    button('Elegir una contraseña nueva', resetUrl),
    paragraph(`${VALIDITY} ${SESSIONS}`),
    mutedParagraph(`${escapeHtml(FALLBACK)}<br>${link(resetUrl, resetUrl)}`),
    mutedParagraph(escapeHtml(NOT_YOU)),
  ]),
});
