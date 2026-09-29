import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';

import {
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../../../shared/domain/errors';
import type { DomainError } from '../../../../shared/domain/errors';

import {
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  LoginLockedError,
  PasswordChangeLockedError,
  RefreshInvalidError,
  ResetLinkExpiredError,
  ResetLinkInvalidError,
  SessionExpiredError,
  SessionNotFoundError,
  SessionRevokedError,
  WrongPasswordError,
} from './index';

const CONTACT = 'soporte@nimbo.me';

type ErrorBase = abstract new (...args: never[]) => DomainError;

const cases: readonly (readonly [string, DomainError, ErrorBase, string, number, string])[] = [
  [
    'CA-2: InvalidCredentialsError',
    new InvalidCredentialsError(),
    UnauthorizedError,
    IDENTITY_ERROR_CODES.INVALID_CREDENTIALS,
    401,
    'El correo o la contraseña no son correctos. Revísalos o restablece tu contraseña.',
  ],
  [
    'CA-3: EmailNotVerifiedError',
    new EmailNotVerifiedError(),
    ForbiddenError,
    IDENTITY_ERROR_CODES.EMAIL_NOT_VERIFIED,
    403,
    'Verifica tu correo con el enlace que te enviamos; si venció, pide uno nuevo.',
  ],
  [
    'CA-4: AccountSuspendedError',
    new AccountSuspendedError(CONTACT),
    ForbiddenError,
    IDENTITY_ERROR_CODES.ACCOUNT_SUSPENDED,
    403,
    `Tu cuenta está suspendida. Si crees que es un error, escríbenos a ${CONTACT}.`,
  ],
  [
    'CA-5: LoginLockedError',
    new LoginLockedError(900),
    TooManyRequestsError,
    IDENTITY_ERROR_CODES.LOGIN_LOCKED,
    429,
    'Hubo demasiados intentos fallidos. Espera 15 minutos o restablece tu contraseña.',
  ],
  [
    'CA-9: RefreshInvalidError',
    new RefreshInvalidError(),
    UnauthorizedError,
    IDENTITY_ERROR_CODES.REFRESH_INVALID,
    401,
    'Tu sesión no es válida. Inicia sesión de nuevo.',
  ],
  [
    'CA-8: SessionExpiredError',
    new SessionExpiredError(),
    UnauthorizedError,
    IDENTITY_ERROR_CODES.SESSION_EXPIRED,
    401,
    'Tu sesión terminó. Inicia sesión de nuevo.',
  ],
  [
    'CA-10: SessionRevokedError',
    new SessionRevokedError(),
    UnauthorizedError,
    IDENTITY_ERROR_CODES.SESSION_REVOKED,
    401,
    'Tu sesión se cerró. Inicia sesión de nuevo.',
  ],
  [
    'CA-12: SessionNotFoundError',
    new SessionNotFoundError(),
    NotFoundError,
    IDENTITY_ERROR_CODES.SESSION_NOT_FOUND,
    404,
    'No encontramos esa sesión. Actualiza la lista.',
  ],
  [
    'CA-20: ResetLinkExpiredError',
    new ResetLinkExpiredError(),
    InvalidInputError,
    IDENTITY_ERROR_CODES.RESET_LINK_EXPIRED,
    422,
    'Este enlace venció. Pide uno nuevo y úsalo en la próxima hora.',
  ],
  [
    'CA-20: ResetLinkInvalidError',
    new ResetLinkInvalidError(),
    InvalidInputError,
    IDENTITY_ERROR_CODES.RESET_LINK_INVALID,
    422,
    'Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.',
  ],
  [
    'CA-23: WrongPasswordError',
    new WrongPasswordError(),
    InvalidInputError,
    IDENTITY_ERROR_CODES.WRONG_PASSWORD,
    422,
    'La contraseña actual no es correcta.',
  ],
  [
    'CA-23: PasswordChangeLockedError',
    new PasswordChangeLockedError(900),
    TooManyRequestsError,
    IDENTITY_ERROR_CODES.PASSWORD_CHANGE_LOCKED,
    429,
    'Hiciste demasiados intentos con una contraseña incorrecta. Espera 15 minutos o restablece tu contraseña.',
  ],
];

describe('errores de sesión de `identity` (plan 002 §5, DT-14)', () => {
  it.each(cases)(
    '%s: código, estado por herencia y mensaje',
    (_name, error, base, code, status, message) => {
      expect(error).toBeInstanceOf(base);
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
      expect(error.message).toBe(message);
    },
  );

  it.each([
    [61, '2 minutos'],
    [60, '1 minuto'],
    [1, '1 minuto'],
    [899, '15 minutos'],
  ])('CA-5: con %i s de bloqueo el inicio de sesión dice «Espera %s»', (seconds, minutes) => {
    const error = new LoginLockedError(seconds);

    expect(error.retryAfterSeconds).toBe(seconds);
    expect(error.message).toContain(`Espera ${minutes} o restablece`);
  });

  it('CA-23: el bloqueo del cambio de contraseña lleva `retryAfterSeconds` y redondea hacia arriba', () => {
    const error = new PasswordChangeLockedError(121);

    expect(error.retryAfterSeconds).toBe(121);
    expect(error.message).toContain('Espera 3 minutos');
  });

  it('CA-23: `WrongPasswordError` marca el campo de la contraseña actual', () => {
    expect(new WrongPasswordError().fields).toEqual([
      {
        field: 'currentPassword',
        reason: 'WRONG_PASSWORD',
        message: 'La contraseña actual no es correcta.',
      },
    ]);
  });
});
