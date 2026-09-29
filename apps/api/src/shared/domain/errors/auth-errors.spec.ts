import {
  ForbiddenError,
  InsufficientRoleError,
  UnauthenticatedError,
  UnauthorizedError,
} from './index';

describe('Errores de autenticación y rol', () => {
  it('CA-1: `UnauthenticatedError` es un `UnauthorizedError` 401 con code SHARED_UNAUTHENTICATED', () => {
    const error = new UnauthenticatedError();

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('SHARED_UNAUTHENTICATED');
    expect(error.message).toBe('Tu sesión no es válida o expiró. Inicia sesión de nuevo.');
  });

  it('CA-5/CA-6: `InsufficientRoleError` es un `ForbiddenError` 403 con code SHARED_FORBIDDEN', () => {
    const error = new InsufficientRoleError();

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.status).toBe(403);
    expect(error.code).toBe('SHARED_FORBIDDEN');
    expect(error.message).toBe(
      'Tu cuenta no tiene permiso para esta acción. Si crees que es un error, escríbenos.',
    );
  });
});
