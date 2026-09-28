import {
  FIELD_ISSUE_REASONS,
  IDENTITY_ERROR_CODES,
  IDENTITY_FIELD_MESSAGES,
  type FieldIssueReason,
} from './error-codes';
import { LEGAL_DOCUMENTS } from './legal';
import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  EMAIL_REQUESTS_PER_HOUR,
  FULL_NAME_MAX_LENGTH,
  MAX_AVISOS_INTENTO_24H,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REGISTRATIONS_PER_IP_PER_HOUR,
  VERIFICATION_LINK_TTL_HOURS,
} from './parameters';

describe('parámetros de identity (spec §6)', () => {
  it('CA-1/CA-15: fija los valores de la spec', () => {
    expect({
      VERIFICATION_LINK_TTL_HOURS,
      EMAIL_REQUEST_COOLDOWN_SECONDS,
      EMAIL_REQUESTS_PER_HOUR,
      REGISTRATIONS_PER_IP_PER_HOUR,
      MAX_AVISOS_INTENTO_24H,
      FULL_NAME_MAX_LENGTH,
      PASSWORD_MIN_LENGTH,
      PASSWORD_MAX_LENGTH,
    }).toEqual({
      VERIFICATION_LINK_TTL_HOURS: 24,
      EMAIL_REQUEST_COOLDOWN_SECONDS: 60,
      EMAIL_REQUESTS_PER_HOUR: 5,
      REGISTRATIONS_PER_IP_PER_HOUR: 10,
      MAX_AVISOS_INTENTO_24H: 1,
      FULL_NAME_MAX_LENGTH: 100,
      PASSWORD_MIN_LENGTH: 12,
      PASSWORD_MAX_LENGTH: 128,
    });
  });
});

describe('LEGAL_DOCUMENTS', () => {
  it('CA-1/CA-23: Términos y Política de privacidad en versión 1.0, vigentes desde 2026-09-30', () => {
    expect(LEGAL_DOCUMENTS).toEqual({
      terms: { version: '1.0', effectiveDate: '2026-09-30' },
      privacy: { version: '1.0', effectiveDate: '2026-09-30' },
    });
  });
});

describe('IDENTITY_ERROR_CODES', () => {
  it('declara los cinco códigos de plan §5', () => {
    expect(Object.values(IDENTITY_ERROR_CODES).sort()).toEqual([
      'IDENTITY_INVALID_INPUT',
      'IDENTITY_TOO_MANY_REQUESTS',
      'IDENTITY_VERIFICATION_LINK_EXPIRED',
      'IDENTITY_VERIFICATION_LINK_INVALID',
      'IDENTITY_WEAK_PASSWORD',
    ]);
  });
});

describe('FIELD_ISSUE_REASONS', () => {
  it('CA-5/CA-6: declara los doce `reason` de identity', () => {
    expect([...FIELD_ISSUE_REASONS].sort()).toEqual([
      'INVALID_EMAIL',
      'PASSWORD_COMMON',
      'PASSWORD_EQUALS_EMAIL',
      'PASSWORD_MISSING_NUMBER',
      'PASSWORD_MISSING_SYMBOL',
      'PASSWORD_MISSING_UPPERCASE',
      'PASSWORD_TOO_LONG',
      'PASSWORD_TOO_SHORT',
      'REQUIRED',
      'TERMS_NOT_ACCEPTED',
      'TOO_LONG',
      'UNKNOWN_FIELD',
    ]);
  });
});

describe('IDENTITY_FIELD_MESSAGES', () => {
  it.each<[FieldIssueReason, string]>([
    ['INVALID_EMAIL', 'Escribe un correo válido, por ejemplo nombre@dominio.com.'],
    [
      'TERMS_NOT_ACCEPTED',
      'Para crear tu cuenta, acepta los Términos y la Política de privacidad.',
    ],
    ['PASSWORD_COMMON', 'Esta contraseña es muy común y fácil de adivinar.'],
    ['PASSWORD_EQUALS_EMAIL', 'Tu contraseña no puede ser tu correo.'],
    ['PASSWORD_TOO_SHORT', '12 caracteres o más'],
    ['PASSWORD_MISSING_UPPERCASE', 'Una mayúscula'],
    ['PASSWORD_MISSING_NUMBER', 'Un número'],
    ['PASSWORD_MISSING_SYMBOL', 'Un símbolo'],
  ])('CA-5/CA-6: el mensaje de %s es el texto de spec §11', (reason, message) => {
    expect(IDENTITY_FIELD_MESSAGES[reason]).toBe(message);
  });

  it('CA-6: todo `reason` tiene un mensaje en español no vacío', () => {
    for (const reason of FIELD_ISSUE_REASONS) {
      expect(IDENTITY_FIELD_MESSAGES[reason].length).toBeGreaterThan(0);
    }
  });
});
