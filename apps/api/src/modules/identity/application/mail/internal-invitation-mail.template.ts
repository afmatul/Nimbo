import { ACCOUNT_SETUP_LINK_TTL_HOURS } from '@nimbo/contracts';

import { escapeHtml } from './escape-html';
import { button, link, mailDocument, mutedParagraph, paragraph } from './mail-layout';
import type { MailContent } from './mail-layout';

export interface InternalInvitationMailInput {
  /** `{WEB_PUBLIC_URL}/crear-contrasena#token=<valor>`: el token va solo en el fragmento, como en 001 y 002. */
  readonly setupUrl: string;
}

const SUBJECT = 'Crea tu contraseña de Nimbo';
const TITLE = 'Tu cuenta de Nimbo está lista';
const INTRO = 'Te dieron de alta en el equipo de Nimbo. Abre este enlace para crear tu contraseña.';
const VALIDITY = `Vence en ${String(ACCOUNT_SETUP_LINK_TTL_HOURS)} horas y solo funciona una vez.`;
const EXPIRED =
  'Si vence, usa «¿Olvidaste tu contraseña?» en el inicio de sesión para crearla con un enlace nuevo.';
const NOT_YOU =
  'Si no esperabas este correo, ignóralo: nadie puede entrar a esta cuenta sin crear la contraseña.';
const FALLBACK = '¿El botón no funciona? Copia este enlace en tu navegador:';

/**
 * Correo con el enlace de alta interna (011 CA-5, CA-7). No lleva el nombre, el rol ni el código de empleado: basta
 * el enlace, y así el correo no repite datos de la cuenta.
 */
export const internalInvitationMail = ({ setupUrl }: InternalInvitationMailInput): MailContent => ({
  subject: SUBJECT,
  text: [INTRO, '', setupUrl, '', VALIDITY, EXPIRED, '', NOT_YOU].join('\n'),
  html: mailDocument(TITLE, [
    paragraph(INTRO),
    button('Crear mi contraseña', setupUrl),
    paragraph(`${VALIDITY} ${EXPIRED}`),
    mutedParagraph(`${escapeHtml(FALLBACK)}<br>${link(setupUrl, setupUrl)}`),
    mutedParagraph(escapeHtml(NOT_YOU)),
  ]),
});
