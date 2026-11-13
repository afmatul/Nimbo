import { FIELD_ISSUE_REASONS, IDENTITY_ERROR_CODES } from './error-codes';

describe('IDENTITY_ERROR_CODES', () => {
  it('CA-2…CA-6, CA-8…CA-10, CA-12, CA-20, CA-23: declara los códigos de 001, de 002 (plan §5) y de 011 (plan §4)', () => {
    expect(Object.values(IDENTITY_ERROR_CODES).sort()).toEqual(
      [
        'IDENTITY_INVALID_INPUT',
        'IDENTITY_TOO_MANY_REQUESTS',
        'IDENTITY_VERIFICATION_LINK_EXPIRED',
        'IDENTITY_VERIFICATION_LINK_INVALID',
        'IDENTITY_WEAK_PASSWORD',
        'IDENTITY_INVALID_CREDENTIALS',
        'IDENTITY_EMAIL_NOT_VERIFIED',
        'IDENTITY_ACCOUNT_SUSPENDED',
        'IDENTITY_LOGIN_LOCKED',
        'IDENTITY_REFRESH_INVALID',
        'IDENTITY_SESSION_EXPIRED',
        'IDENTITY_SESSION_REVOKED',
        'IDENTITY_SESSION_NOT_FOUND',
        'IDENTITY_RESET_LINK_EXPIRED',
        'IDENTITY_RESET_LINK_INVALID',
        'IDENTITY_WRONG_PASSWORD',
        'IDENTITY_PASSWORD_CHANGE_LOCKED',
        'IDENTITY_ACCOUNT_NOT_FOUND',
        'IDENTITY_CANNOT_CHANGE_OWN_STATUS',
        'IDENTITY_LAST_ACTIVE_ADMIN',
        'IDENTITY_ACCOUNT_STATE_CONFLICT',
        'IDENTITY_ENROLLMENT_CONFLICT',
        'IDENTITY_ADMIN_ALREADY_EXISTS',
        'IDENTITY_SETUP_LINK_INVALID',
        'IDENTITY_SETUP_LINK_EXPIRED',
      ].sort(),
    );
  });

  it('cada clave es el código sin el prefijo del módulo', () => {
    for (const [key, code] of Object.entries(IDENTITY_ERROR_CODES)) {
      expect(code).toBe(`IDENTITY_${key}`);
    }
  });
});

describe('FIELD_ISSUE_REASONS', () => {
  it('CA-5/CA-6 (001), CA-23 y 011 CA-6 y registro con plan: declara los `reason` de identity', () => {
    expect([...FIELD_ISSUE_REASONS].sort()).toEqual([
      'EMAIL_IN_USE',
      'EMPLOYEE_CODE_IN_USE',
      'INVALID_EMAIL',
      'INVALID_EMPLOYEE_CODE',
      'INVALID_PLAN',
      'INVALID_ROLE',
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
      'WRONG_PASSWORD',
    ]);
  });
});
