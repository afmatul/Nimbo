import { IDENTITY_ERROR_CODES, SHARED_ERROR_CODES } from '@nimbo/contracts';

import {
  ConflictError,
  DomainError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
} from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

import {
  AccountNotFoundError,
  AccountStateConflictError,
  ActorNotActiveError,
  AdminAlreadyExistsError,
  CannotChangeOwnStatusError,
  EnrollmentConflictError,
  LastActiveAdminError,
  SetupLinkExpiredError,
  SetupLinkInvalidError,
} from './index';

const EMAIL_IN_USE: FieldIssue = {
  field: 'email',
  reason: 'EMAIL_IN_USE',
  message: 'Este correo ya tiene una cuenta. Usa otro correo.',
};

describe('errores de cuentas internas (011 plan §2, §4)', () => {
  it.each([
    {
      error: new AccountNotFoundError(),
      code: IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND,
      status: 404,
      base: NotFoundError,
    },
    {
      error: new CannotChangeOwnStatusError(),
      code: IDENTITY_ERROR_CODES.CANNOT_CHANGE_OWN_STATUS,
      status: 409,
      base: ConflictError,
    },
    {
      error: new LastActiveAdminError(),
      code: IDENTITY_ERROR_CODES.LAST_ACTIVE_ADMIN,
      status: 409,
      base: ConflictError,
    },
    {
      error: new AccountStateConflictError(),
      code: IDENTITY_ERROR_CODES.ACCOUNT_STATE_CONFLICT,
      status: 409,
      base: ConflictError,
    },
    {
      error: new AdminAlreadyExistsError(),
      code: IDENTITY_ERROR_CODES.ADMIN_ALREADY_EXISTS,
      status: 409,
      base: ConflictError,
    },
    {
      error: new SetupLinkInvalidError(),
      code: IDENTITY_ERROR_CODES.SETUP_LINK_INVALID,
      status: 422,
      base: InvalidInputError,
    },
    {
      error: new SetupLinkExpiredError(),
      code: IDENTITY_ERROR_CODES.SETUP_LINK_EXPIRED,
      status: 422,
      base: InvalidInputError,
    },
    {
      error: new ActorNotActiveError(),
      code: SHARED_ERROR_CODES.FORBIDDEN,
      status: 403,
      base: ForbiddenError,
    },
  ] as const)(
    '$error.name usa el código $code y el status $status',
    ({ error, code, status, base }) => {
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(base);
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
      expect(error.message.length).toBeGreaterThan(0);
    },
  );

  it('CA-6: `EnrollmentConflictError` lleva los campos en conflicto', () => {
    const error = new EnrollmentConflictError([EMAIL_IN_USE]);

    expect(error.code).toBe(IDENTITY_ERROR_CODES.ENROLLMENT_CONFLICT);
    expect(error.status).toBe(409);
    expect(error.fields).toEqual([EMAIL_IN_USE]);
  });

  it('RN-7: un actor ya no activo recibe la misma respuesta que un rol sin permiso', () => {
    const error = new ActorNotActiveError();

    expect(error.name).toBe('ActorNotActiveError');
    expect(error.message).toBe(
      'Tu cuenta no tiene permiso para esta acción. Si crees que es un error, escríbenos.',
    );
  });

  it('CA-5: el enlace vencido indica usar «¿Olvidaste tu contraseña?» (sin reenvío, Q-3)', () => {
    expect(new SetupLinkExpiredError().message).toContain('«¿Olvidaste tu contraseña?»');
  });
});
