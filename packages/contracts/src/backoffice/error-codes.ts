/** Códigos de error propios del backoffice (011 plan §4). Los de cuentas y altas son de `identity`. */
export const BACKOFFICE_ERROR_CODES = {
  INVALID_QUERY: 'BACKOFFICE_INVALID_QUERY',
  CLIENT_NOT_FOUND: 'BACKOFFICE_CLIENT_NOT_FOUND',
} as const;

export type BackofficeErrorCode =
  (typeof BACKOFFICE_ERROR_CODES)[keyof typeof BACKOFFICE_ERROR_CODES];

/** Conjunto cerrado de `fields[].reason` de `BACKOFFICE_INVALID_QUERY`. */
export const BACKOFFICE_FIELD_ISSUE_REASONS = [
  'REQUIRED',
  'INVALID_EMAIL',
  'INVALID_PAGE',
] as const;
export type BackofficeFieldIssueReason = (typeof BACKOFFICE_FIELD_ISSUE_REASONS)[number];

/** Mensaje de cada `reason`: la API lo envía y `web` lo muestra junto al campo (Art. VI.3). */
export const BACKOFFICE_FIELD_MESSAGES: Readonly<Record<BackofficeFieldIssueReason, string>> = {
  REQUIRED: 'Escribe el correo de la cuenta que buscas.',
  INVALID_EMAIL: 'Escribe un correo válido, por ejemplo nombre@dominio.com.',
  INVALID_PAGE: 'Esta página no existe. Vuelve a la primera página e inténtalo de nuevo.',
};
