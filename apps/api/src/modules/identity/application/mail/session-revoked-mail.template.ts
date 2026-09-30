import { escapeHtml } from './escape-html';
import { formatGuatemalaDateTime } from './guatemala-date.format';
import { button, link, mailDocument, mutedParagraph, paragraph } from './mail-layout';
import type { MailContent } from './mail-layout';

export interface SessionRevokedMailInput {
  readonly revokedAt: Date;
  /** Resumen del agente de usuario del dispositivo de la sesión (`UserAgentSummary`). */
  readonly browser: string;
  readonly os: string;
  /** `{WEB_PUBLIC_URL}/cuenta/seguridad`. */
  readonly securityUrl: string;
  /** `{WEB_PUBLIC_URL}/recuperar-contrasena`. */
  readonly passwordRecoveryUrl: string;
}

const SUBJECT = 'Cerramos una sesión por seguridad';
const ADVICE = 'Si no reconoces la actividad, cambia tu contraseña.';
const REVIEW = 'Revisa tus sesiones abiertas en Seguridad.';
const FORGOT = '¿No recuerdas tu contraseña? Restablécela aquí:';

/** Aviso de sesión revocada por reúso de un token de refresco rotado (spec §11, CA-9). Sin IP (D-9). */
export const sessionRevokedMail = ({
  revokedAt,
  browser,
  os,
  securityUrl,
  passwordRecoveryUrl,
}: SessionRevokedMailInput): MailContent => {
  const { date, time } = formatGuatemalaDateTime(revokedAt);
  const sentence =
    `Cerramos una sesión de tu cuenta (${browser} · ${os}) porque sus credenciales se usaron de forma sospechosa. ` +
    `Ocurrió el ${date} a las ${time} (hora de Guatemala).`;
  return {
    subject: SUBJECT,
    text: [
      sentence,
      '',
      ADVICE,
      '',
      `${REVIEW} ${securityUrl}`,
      '',
      `${FORGOT} ${passwordRecoveryUrl}`,
    ].join('\n'),
    html: mailDocument(SUBJECT, [
      paragraph(sentence),
      paragraph(ADVICE),
      button('Ir a Seguridad', securityUrl),
      mutedParagraph(
        `${escapeHtml(FORGOT)} ${link('Restablecer contraseña', passwordRecoveryUrl)}`,
      ),
    ]),
  };
};
