import { formatGuatemalaDateTime } from './guatemala-date.format';
import { button, mailDocument, paragraph } from './mail-layout';
import type { MailContent } from './mail-layout';

export interface NewDeviceMailInput {
  readonly signedInAt: Date;
  /** Resumen del agente de usuario (`UserAgentSummary`), nunca la cadena completa. */
  readonly browser: string;
  readonly os: string;
  /** `{WEB_PUBLIC_URL}/cuenta/seguridad`. */
  readonly securityUrl: string;
}

const SUBJECT = 'Nuevo inicio de sesión en Nimbo';
const TITLE = 'Nuevo inicio de sesión';
const IF_YOU = 'Si fuiste tú, no tienes que hacer nada.';
const IF_NOT = 'Si no, cambia tu contraseña y cierra esa sesión desde Seguridad.';

/** Aviso de inicio de sesión desde un navegador que la cuenta no conocía (spec §11, CA-16). Sin IP (D-9). */
export const newDeviceMail = ({
  signedInAt,
  browser,
  os,
  securityUrl,
}: NewDeviceMailInput): MailContent => {
  const { date, time } = formatGuatemalaDateTime(signedInAt);
  const sentence =
    `Alguien inició sesión en tu cuenta el ${date} a las ${time} (hora de Guatemala) ` +
    `desde ${browser} en ${os}.`;
  return {
    subject: SUBJECT,
    text: [sentence, '', IF_YOU, IF_NOT, '', securityUrl].join('\n'),
    html: mailDocument(TITLE, [
      paragraph(sentence),
      paragraph(`${IF_YOU} ${IF_NOT}`),
      button('Ir a Seguridad', securityUrl),
    ]),
  };
};
