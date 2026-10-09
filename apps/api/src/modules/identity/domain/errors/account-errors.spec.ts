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
    [new AccountNotFoundError(), IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND, 404, NotFoundError],
    [
      new CannotChangeOwnStatusError(),
      IDENTITY_ERROR_CODES.CANNOT_CHANGE_OWN_STATUS,
      409,
      ConflictError,
    ],
    [new LastActiveAdminError(), IDENTITY_ERROR_CODES.LAST_ACTIVE_ADMIN, 409, ConflictError],
    [
      new AccountStateConflictError(),
      IDENTITY_ERROR_CODES.ACCOUNT_STATE_CONFLICT,
      409,
      ConflictError,
    ],
    [new AdminAlreadyExistsError(), IDENTITY_ERROR_CODES.ADMIN_ALREADY_EXISTS, 409, ConflictError],
    [new SetupLinkInvalidError(), IDENTITY_ERROR_CODES.SETUP_LINK_INVALID, 422, InvalidInputError],
    [new SetupLinkExpiredError(), IDENTITY_ERROR_CODES.SETUP_LINK_EXPIRED, 422, InvalidInputError],
    [new ActorNotActiveError(), SHARED_ERROR_CODES.FORBIDDEN, 403, ForbiddenError],
  ] as const)('%p usa el código %s y el status %i', (error, code, status, base) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(base);
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
    expect(error.message.length).toBeGreaterThan(0);
  });

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
