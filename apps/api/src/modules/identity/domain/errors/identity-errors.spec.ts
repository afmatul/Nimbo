import {
  DomainError,
  InvalidInputError,
  TooManyRequestsError,
} from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

import {
  IdentityInvalidInputError,
  IdentityTooManyRequestsError,
  IdentityWeakPasswordError,
  VerificationLinkExpiredError,
  VerificationLinkInvalidError,
} from './index';

const EMAIL_ISSUE: FieldIssue = {
  field: 'email',
  reason: 'INVALID_EMAIL',
  message: 'Escribe un correo válido, por ejemplo nombre@dominio.com.',
};

const passwordIssue = (reason: string, message: string): FieldIssue => ({
  field: 'password',
  reason,
  message,
});

describe('errores de `identity` (plan §5)', () => {
  it('CA-6: `IdentityInvalidInputError` es un 422 con `fields` y el mensaje de revisar los campos', () => {
    const error = new IdentityInvalidInputError([EMAIL_ISSUE]);

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('IDENTITY_INVALID_INPUT');
    expect(error.status).toBe(422);
    expect(error.message).toBe('Revisa los campos marcados y corrígelos para continuar.');
    expect(error.fields).toEqual([EMAIL_ISSUE]);
  });

  it('CA-5: `IdentityWeakPasswordError` es un 422 que nombra cada requisito incumplido', () => {
    const fields = [
      passwordIssue('PASSWORD_MISSING_UPPERCASE', 'Una mayúscula'),
      passwordIssue('PASSWORD_MISSING_SYMBOL', 'Un símbolo'),
    ];

    const error = new IdentityWeakPasswordError(fields);

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.code).toBe('IDENTITY_WEAK_PASSWORD');
    expect(error.status).toBe(422);
    expect(error.message).toBe(
      'Tu contraseña no cumple estos requisitos: Una mayúscula; Un símbolo. Elige otra que los cumpla.',
    );
    expect(error.fields).toEqual(fields);
  });

  it('CA-5: quita el punto final de los requisitos que son oraciones para no duplicarlo', () => {
    const error = new IdentityWeakPasswordError([
      passwordIssue('PASSWORD_EQUALS_EMAIL', 'Tu contraseña no puede ser tu correo.'),
    ]);

    expect(error.message).toBe(
      'Tu contraseña no cumple estos requisitos: Tu contraseña no puede ser tu correo. Elige otra que los cumpla.',
    );
  });

  it('CA-9: `VerificationLinkExpiredError` es un 422 que pide un enlace nuevo', () => {
    const error = new VerificationLinkExpiredError();

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.code).toBe('IDENTITY_VERIFICATION_LINK_EXPIRED');
    expect(error.status).toBe(422);
    expect(error.message).toBe(
      'Este enlace venció. Pide uno nuevo y ábrelo en las próximas 24 horas.',
    );
    expect(error.fields).toBeUndefined();
  });

  it('CA-11: `VerificationLinkInvalidError` es un 422 que remite al correo más reciente', () => {
    const error = new VerificationLinkInvalidError();

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.code).toBe('IDENTITY_VERIFICATION_LINK_INVALID');
    expect(error.status).toBe(422);
    expect(error.message).toBe(
      'Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.',
    );
  });

  describe('IdentityTooManyRequestsError', () => {
    it('CA-15: es un 429 con `retryAfterSeconds`, el ámbito y los minutos redondeados hacia arriba', () => {
      const error = new IdentityTooManyRequestsError(3000, 'email');

      expect(error).toBeInstanceOf(TooManyRequestsError);
      expect(error.code).toBe('IDENTITY_TOO_MANY_REQUESTS');
      expect(error.status).toBe(429);
      expect(error.retryAfterSeconds).toBe(3000);
      expect(error.scope).toBe('email');
      expect(error.message).toBe(
        'Ya te enviamos un enlace hace poco. Revisa tu bandeja y la carpeta de spam, o inténtalo de nuevo en 50 minutos.',
      );
    });

    it.each([
      [61, '2 minutos'],
      [3599, '60 minutos'],
      [60, '1 minuto'],
      [1, '1 minuto'],
      [0, '1 minuto'],
    ])('CA-15: con %i s de espera dice «%s»', (seconds, minutes) => {
      const error = new IdentityTooManyRequestsError(seconds, 'ip');

      expect(error.message).toContain(`inténtalo de nuevo en ${minutes}.`);
    });
  });
});
