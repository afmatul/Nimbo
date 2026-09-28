import {
  IDENTITY_ERROR_CODES,
  IDENTITY_FIELD_MESSAGES,
  registerRequestSchema,
  toFieldIssues,
} from '@nimbo/contracts';

import type { FieldIssue } from '../../../shared';
import {
  IdentityInvalidInputError,
  IdentityTooManyRequestsError,
  IdentityWeakPasswordError,
  VerificationLinkExpiredError,
  VerificationLinkInvalidError,
} from '../domain/errors';

import { identityValidationError } from './identity-validation';

const VALID_REGISTRATION = {
  fullName: 'Lucía Pérez',
  email: 'lucia@ejemplo.com',
  password: 'Nimbo-Seguro-2026',
  acceptTerms: true,
};

/** Los *issues* que produciría el `ZodValidationPipe` para este cuerpo. */
const issuesOf = (body: Record<string, unknown>): readonly FieldIssue[] => {
  const result = registerRequestSchema.safeParse(body);
  if (result.success) {
    throw new Error('El cuerpo de la prueba debía ser inválido.');
  }
  return toFieldIssues(result.error);
};

const reasonsOf = (issues: readonly FieldIssue[] | undefined): string[] =>
  (issues ?? []).map((issue) => `${issue.field}:${issue.reason}`);

describe('identityValidationError (plan §5, ADR-0020)', () => {
  it('CA-5: si todos los problemas son reglas de la contraseña, es `IDENTITY_WEAK_PASSWORD` con cada regla', () => {
    const issues = issuesOf({ ...VALID_REGISTRATION, password: 'corta' });

    const error = identityValidationError(issues);

    expect(error).toBeInstanceOf(IdentityWeakPasswordError);
    expect(error.fields).toEqual(issues);
    expect(reasonsOf(error.fields)).toEqual(
      expect.arrayContaining([
        'password:PASSWORD_TOO_SHORT',
        'password:PASSWORD_MISSING_UPPERCASE',
        'password:PASSWORD_MISSING_NUMBER',
        'password:PASSWORD_MISSING_SYMBOL',
      ]),
    );
    expect(error.message).toContain(IDENTITY_FIELD_MESSAGES.PASSWORD_MISSING_UPPERCASE);
  });

  it('CA-6: con más de un campo inválido es `IDENTITY_INVALID_INPUT` con todos, incluidas las reglas de la contraseña', () => {
    const issues = issuesOf({
      ...VALID_REGISTRATION,
      email: 'no-es-correo',
      password: 'corta',
      acceptTerms: false,
    });

    const error = identityValidationError(issues);

    expect(error).toBeInstanceOf(IdentityInvalidInputError);
    expect(error.fields).toEqual(issues);
    expect(reasonsOf(error.fields)).toEqual(
      expect.arrayContaining([
        'email:INVALID_EMAIL',
        'acceptTerms:TERMS_NOT_ACCEPTED',
        'password:PASSWORD_TOO_SHORT',
        'password:PASSWORD_MISSING_SYMBOL',
      ]),
    );
  });

  it('CA-6: una contraseña ausente es un campo obligatorio, no una contraseña débil', () => {
    const { password: _omitted, ...withoutPassword } = VALID_REGISTRATION;
    const issues = issuesOf(withoutPassword);

    const error = identityValidationError(issues);

    expect(error).toBeInstanceOf(IdentityInvalidInputError);
    expect(reasonsOf(error.fields)).toEqual(['password:REQUIRED']);
  });

  it('CA-7: un campo no declarado (`rol`) es `IDENTITY_INVALID_INPUT` con `UNKNOWN_FIELD`', () => {
    const issues = issuesOf({ ...VALID_REGISTRATION, rol: 'ADMIN' });

    const error = identityValidationError(issues);

    expect(error).toBeInstanceOf(IdentityInvalidInputError);
    expect(reasonsOf(error.fields)).toEqual(['rol:UNKNOWN_FIELD']);
  });

  it('CA-7: un campo no declarado junto a una contraseña débil sigue siendo `IDENTITY_INVALID_INPUT`', () => {
    const issues = issuesOf({ ...VALID_REGISTRATION, password: 'corta', planId: 'pro' });

    const error = identityValidationError(issues);

    expect(error).toBeInstanceOf(IdentityInvalidInputError);
    expect(reasonsOf(error.fields)).toContain('planId:UNKNOWN_FIELD');
  });

  it('CA-5, CA-6: los `code` de las clases de error coinciden con `IDENTITY_ERROR_CODES` (una sola fuente, Art. VI)', () => {
    const codes = {
      INVALID_INPUT: new IdentityInvalidInputError([]).code,
      WEAK_PASSWORD: new IdentityWeakPasswordError([]).code,
      TOO_MANY_REQUESTS: new IdentityTooManyRequestsError(60, 'email').code,
      VERIFICATION_LINK_EXPIRED: new VerificationLinkExpiredError().code,
      VERIFICATION_LINK_INVALID: new VerificationLinkInvalidError().code,
    };

    expect(codes).toEqual(IDENTITY_ERROR_CODES);
  });
});
