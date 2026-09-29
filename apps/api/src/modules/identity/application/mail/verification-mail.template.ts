import { escapeHtml } from './escape-html';
import { button, link, mailDocument, mutedParagraph, paragraph, warningBox } from './mail-layout';
import type { MailContent } from './mail-layout';

export interface VerificationMailInput {
  /** `{WEB_PUBLIC_URL}/verificar-correo#token=<valor>`: el token va en el fragmento (RN-8). */
  readonly verificationUrl: string;
}

const SUBJECT = 'Verifica tu correo para entrar a Nimbo';
const TITLE = 'Confirma tu correo';
const INTRO = 'Abre este enlace para verificar tu correo y entrar a Nimbo.';
const VALIDITY =
  'El enlace vence en 24 horas y solo funciona una vez. Si vence, pide uno nuevo desde la página de inicio de sesión.';
const WARNING = 'No reenvíes este correo: quien abra el enlace entrará a tu cuenta.';
const FALLBACK = '¿El botón no funciona? Copia este enlace en tu navegador:';
const NOT_YOU = 'Si no creaste una cuenta en Nimbo, ignora este mensaje.';

/**
 * Correo con el enlace de verificación (spec §11, CA-1, RN-9). No saluda por nombre: lo escribió quien pidió el
 * registro y podría no ser el dueño del buzón.
 */
export const verificationMail = ({ verificationUrl }: VerificationMailInput): MailContent => ({
  subject: SUBJECT,
  text: [INTRO, '', verificationUrl, '', VALIDITY, '', WARNING, '', NOT_YOU].join('\n'),
  html: mailDocument(TITLE, [
    paragraph(INTRO),
    button('Verificar mi correo', verificationUrl),
    paragraph(VALIDITY),
    warningBox(WARNING),
    mutedParagraph(`${escapeHtml(FALLBACK)}<br>${link(verificationUrl, verificationUrl)}`),
    mutedParagraph(escapeHtml(NOT_YOU)),
  ]),
});
