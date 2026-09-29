const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa texto para el cuerpo o un atributo entre comillas dobles del HTML de un correo. */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
