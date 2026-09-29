import { escapeHtml } from './escape-html';

/** Asunto y cuerpos de un correo; quien lo envía agrega destinatario y clave (`MailMessage`). */
export interface MailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * Estilos en línea de los correos de `identity`. Los clientes de correo no cargan hojas de estilo, así que se usan
 * los valores de Cielo Sereno escritos aquí: es la excepción a los tokens (plan §6.4). El botón usa el azul
 * profundo porque el blanco sobre el azul pizarra no llega a AA.
 */
const STYLE = {
  body: 'margin:0;padding:24px 12px;background:#F4F7FB;font-family:Inter,Arial,sans-serif;color:#1E2D40;',
  card: 'max-width:600px;margin:0 auto;padding:32px;background:#FFFFFF;border:1px solid #DDE6F0;border-radius:12px;',
  brand: 'margin:0 0 24px;font-size:16px;font-weight:700;letter-spacing:0.04em;color:#1E2D40;',
  title: 'margin:0 0 16px;font-size:22px;line-height:1.3;color:#1E2D40;',
  paragraph: 'margin:0 0 16px;font-size:15px;line-height:1.6;color:#3A5068;',
  buttonWrapper: 'margin:0 0 24px;',
  button:
    'display:inline-block;padding:12px 24px;background:#4A6FA5;color:#FFFFFF;font-weight:600;' +
    'font-size:15px;text-decoration:none;border-radius:8px;',
  warning:
    'margin:0 0 16px;padding:12px 16px;background:#FBF4E9;border-radius:8px;font-size:14px;' +
    'line-height:1.5;color:#1E2D40;',
  link: 'color:#4A6FA5;word-break:break-all;',
  muted: 'margin:0 0 12px;font-size:13px;line-height:1.5;color:#3A5068;',
} as const;

export const paragraph = (text: string): string =>
  `<p style="${STYLE.paragraph}">${escapeHtml(text)}</p>`;

/** Párrafo secundario; recibe HTML ya armado con `link` o texto escapado. */
export const mutedParagraph = (html: string): string => `<p style="${STYLE.muted}">${html}</p>`;

/** Advertencia destacada, en negrita completa para que se lea como una sola frase. */
export const warningBox = (text: string): string =>
  `<p style="${STYLE.warning}"><strong>${escapeHtml(text)}</strong></p>`;

export const button = (label: string, url: string): string =>
  `<p style="${STYLE.buttonWrapper}"><a href="${escapeHtml(url)}" style="${STYLE.button}">` +
  `${escapeHtml(label)}</a></p>`;

export const link = (label: string, url: string): string =>
  `<a href="${escapeHtml(url)}" style="${STYLE.link}">${escapeHtml(label)}</a>`;

/** Documento completo: marca, título y el contenido ya armado con las piezas de arriba. */
export const mailDocument = (title: string, content: readonly string[]): string =>
  [
    '<!doctype html>',
    '<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
    `<title>${escapeHtml(title)}</title></head>`,
    `<body style="${STYLE.body}"><div style="${STYLE.card}">`,
    `<p style="${STYLE.brand}">NIMBO</p>`,
    `<h1 style="${STYLE.title}">${escapeHtml(title)}</h1>`,
    ...content,
    '</div></body></html>',
  ].join('\n');
