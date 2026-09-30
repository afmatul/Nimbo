import { FULL_NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './parameters';

/** Códigos de error de `identity` (planes 001 y 002, §5). Las clases de `api` los reutilizan (Art. VI). */
export const IDENTITY_ERROR_CODES = {
  INVALID_INPUT: 'IDENTITY_INVALID_INPUT',
  WEAK_PASSWORD: 'IDENTITY_WEAK_PASSWORD',
  TOO_MANY_REQUESTS: 'IDENTITY_TOO_MANY_REQUESTS',
  VERIFICATION_LINK_EXPIRED: 'IDENTITY_VERIFICATION_LINK_EXPIRED',
  VERIFICATION_LINK_INVALID: 'IDENTITY_VERIFICATION_LINK_INVALID',
  INVALID_CREDENTIALS: 'IDENTITY_INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'IDENTITY_EMAIL_NOT_VERIFIED',
  ACCOUNT_SUSPENDED: 'IDENTITY_ACCOUNT_SUSPENDED',
  LOGIN_LOCKED: 'IDENTITY_LOGIN_LOCKED',
  REFRESH_INVALID: 'IDENTITY_REFRESH_INVALID',
  SESSION_EXPIRED: 'IDENTITY_SESSION_EXPIRED',
  SESSION_REVOKED: 'IDENTITY_SESSION_REVOKED',
  SESSION_NOT_FOUND: 'IDENTITY_SESSION_NOT_FOUND',
  RESET_LINK_EXPIRED: 'IDENTITY_RESET_LINK_EXPIRED',
  RESET_LINK_INVALID: 'IDENTITY_RESET_LINK_INVALID',
  WRONG_PASSWORD: 'IDENTITY_WRONG_PASSWORD',
  PASSWORD_CHANGE_LOCKED: 'IDENTITY_PASSWORD_CHANGE_LOCKED',
} as const;

export type IdentityErrorCode = (typeof IDENTITY_ERROR_CODES)[keyof typeof IDENTITY_ERROR_CODES];

/** Conjunto cerrado de `reason` que `identity` emite en `fields` (plan §5). */
export const FIELD_ISSUE_REASONS = [
  'REQUIRED',
  'TOO_LONG',
  'INVALID_EMAIL',
  'UNKNOWN_FIELD',
  'TERMS_NOT_ACCEPTED',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'PASSWORD_MISSING_UPPERCASE',
  'PASSWORD_MISSING_NUMBER',
  'PASSWORD_MISSING_SYMBOL',
  'PASSWORD_COMMON',
  'PASSWORD_EQUALS_EMAIL',
  'WRONG_PASSWORD',
] as const;

export type FieldIssueReason = (typeof FIELD_ISSUE_REASONS)[number];

/**
 * Mensaje por `reason` (spec §11). Los de las reglas de composición de la contraseña son los rótulos de los
 * requisitos en vivo; el `api` los enumera en `IDENTITY_WEAK_PASSWORD`.
 */
export const IDENTITY_FIELD_MESSAGES: Readonly<Record<FieldIssueReason, string>> = {
  REQUIRED: 'Completa este campo.',
  TOO_LONG: `Usa como máximo ${String(FULL_NAME_MAX_LENGTH)} caracteres.`,
  INVALID_EMAIL: 'Escribe un correo válido, por ejemplo nombre@dominio.com.',
  UNKNOWN_FIELD: 'Este campo no se admite. Quítalo y vuelve a intentarlo.',
  TERMS_NOT_ACCEPTED: 'Para crear tu cuenta, acepta los Términos y la Política de privacidad.',
  PASSWORD_TOO_SHORT: `${String(PASSWORD_MIN_LENGTH)} caracteres o más`,
  PASSWORD_TOO_LONG: `${String(PASSWORD_MAX_LENGTH)} caracteres o menos`,
  PASSWORD_MISSING_UPPERCASE: 'Una mayúscula',
  PASSWORD_MISSING_NUMBER: 'Un número',
  PASSWORD_MISSING_SYMBOL: 'Un símbolo',
  PASSWORD_COMMON: 'Esta contraseña es muy común y fácil de adivinar.',
  PASSWORD_EQUALS_EMAIL: 'Tu contraseña no puede ser tu correo.',
  WRONG_PASSWORD: 'La contraseña actual no es correcta.',
};
