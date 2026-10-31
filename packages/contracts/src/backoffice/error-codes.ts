import { AUDIT_NOTE_MAX_LENGTH } from '../audit';
import { FILES_PAGE_MAX } from '../storage';

/** Códigos de error propios del backoffice (011 y 011b, plan §4). Los de cuentas y altas son de `identity`. */
export const BACKOFFICE_ERROR_CODES = {
  INVALID_QUERY: 'BACKOFFICE_INVALID_QUERY',
  CLIENT_NOT_FOUND: 'BACKOFFICE_CLIENT_NOT_FOUND',
  /** 011b CA-3: extra o fecha que no valen, o una cuenta sin suscripción. */
  QUOTA_INVALID: 'BACKOFFICE_QUOTA_INVALID',
  /** 011b CA-2: `cuota del plan + extra < espacio usado`. */
  QUOTA_BELOW_USAGE: 'BACKOFFICE_QUOTA_BELOW_USAGE',
  /** 011b CA-7: Personal, sin suscripción o un día que no es posterior al último de la vigencia. */
  VALIDITY_NOT_EXTENDED: 'BACKOFFICE_VALIDITY_NOT_EXTENDED',
  /** 011b CA-12: correo, motivo o tipo inválidos al restaurar (`422` con `fields`). */
  INVALID_INPUT: 'BACKOFFICE_INVALID_INPUT',
} as const;

export type BackofficeErrorCode =
  (typeof BACKOFFICE_ERROR_CODES)[keyof typeof BACKOFFICE_ERROR_CODES];

/**
 * Conjunto cerrado de `fields[].reason` del backoffice: las listas (011), la forma de los ajustes y la papelera de
 * Soporte (011b).
 */
export const BACKOFFICE_FIELD_ISSUE_REASONS = [
  'REQUIRED',
  'INVALID_EMAIL',
  'INVALID_PAGE',
  'INVALID_EXTRA_BYTES',
  'INVALID_DAY',
  'INVALID_CURSOR',
  'INVALID_LIMIT',
  'NOTE_REQUIRED',
  'NOTE_TOO_LONG',
  'INVALID_NODE_TYPE',
] as const;
export type BackofficeFieldIssueReason = (typeof BACKOFFICE_FIELD_ISSUE_REASONS)[number];

/** Mensaje de cada `reason`: la API lo envía y `web` lo muestra junto al campo (Art. VI.3). */
export const BACKOFFICE_FIELD_MESSAGES: Readonly<Record<BackofficeFieldIssueReason, string>> = {
  REQUIRED: 'Escribe el correo de la cuenta que buscas.',
  INVALID_EMAIL: 'Escribe un correo válido, por ejemplo nombre@dominio.com.',
  INVALID_PAGE: 'Esta página no existe. Vuelve a la primera página e inténtalo de nuevo.',
  INVALID_EXTRA_BYTES:
    'Escribe un espacio extra mayor que cero y dentro del máximo admitido. Para quitarlo, usa «Quitar extra».',
  INVALID_DAY: 'Elige un día válido del calendario.',
  INVALID_CURSOR: 'Esta página de la papelera ya no está disponible. Busca al cliente de nuevo.',
  INVALID_LIMIT: `Pide entre 1 y ${String(FILES_PAGE_MAX)} elementos por página.`,
  NOTE_REQUIRED: 'Escribe el motivo de la restauración.',
  NOTE_TOO_LONG: `Escribe un motivo de ${String(AUDIT_NOTE_MAX_LENGTH)} caracteres o menos.`,
  INVALID_NODE_TYPE:
    'No pudimos identificar el elemento. Actualiza la papelera e inténtalo de nuevo.',
};
