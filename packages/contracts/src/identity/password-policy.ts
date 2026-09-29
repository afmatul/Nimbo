import { COMMON_PASSWORDS } from './common-passwords';
import type { FieldIssueReason } from './error-codes';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './parameters';

/** Reglas de la política de contraseña (D-6), en el orden en que se muestran. */
export type PasswordRule =
  'minLength' | 'maxLength' | 'uppercase' | 'number' | 'symbol' | 'notCommon' | 'notEmail';

export interface PasswordRuleResult {
  readonly rule: PasswordRule;
  readonly passed: boolean;
  /** `reason` que se informa en `fields` cuando la regla no se cumple. */
  readonly reason: FieldIssueReason;
}

const UPPERCASE = /\p{Lu}/u;
const NUMBER = /\p{Nd}/u;
/** Un carácter que no es letra, número ni espacio en blanco. */
const SYMBOL = /[^\p{L}\p{N}\s]/u;
const COMMON = new Set(COMMON_PASSWORDS);

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function equalsEmail(lowered: string, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  const localPart = at > 0 ? normalized.slice(0, at) : '';
  return lowered === normalized || (localPart.length > 0 && lowered === localPart);
}

/**
 * Evalúa la contraseña contra cada regla de D-6. Pura y sin zod: la usan el esquema de registro (`api`) y los
 * requisitos en vivo del formulario (`web`, CA-22). Cuenta puntos de código, no unidades UTF-16.
 */
export function evaluatePassword(password: string, email: string): PasswordRuleResult[] {
  const length = codePointLength(password);
  const lowered = password.toLowerCase();
  return [
    { rule: 'minLength', passed: length >= PASSWORD_MIN_LENGTH, reason: 'PASSWORD_TOO_SHORT' },
    { rule: 'maxLength', passed: length <= PASSWORD_MAX_LENGTH, reason: 'PASSWORD_TOO_LONG' },
    { rule: 'uppercase', passed: UPPERCASE.test(password), reason: 'PASSWORD_MISSING_UPPERCASE' },
    { rule: 'number', passed: NUMBER.test(password), reason: 'PASSWORD_MISSING_NUMBER' },
    { rule: 'symbol', passed: SYMBOL.test(password), reason: 'PASSWORD_MISSING_SYMBOL' },
    { rule: 'notCommon', passed: !COMMON.has(lowered), reason: 'PASSWORD_COMMON' },
    { rule: 'notEmail', passed: !equalsEmail(lowered, email), reason: 'PASSWORD_EQUALS_EMAIL' },
  ];
}
