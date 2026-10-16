import { ConflictError, NotFoundError } from '../../../../shared/domain/errors';

import { VersionAlreadyCurrentError, VersionNotFoundError } from './index';

describe('errores de versiones (014 plan §4)', () => {
  it('CA-11: `VersionNotFoundError` es un 404 con acción correctiva y sin el número en el mensaje', () => {
    const error = new VersionNotFoundError();

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.status).toBe(404);
    expect(error.code).toBe('STORAGE_VERSION_NOT_FOUND');
    expect(error.message).toBe(
      'No encontramos esta versión. Puede que se haya eliminado al superar las versiones que conserva tu plan. ' +
        'Actualiza el historial para ver las disponibles.',
    );
  });

  it('CA-10: `VersionAlreadyCurrentError` es un 409 con el texto de la spec', () => {
    const error = new VersionAlreadyCurrentError();

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('STORAGE_VERSION_ALREADY_CURRENT');
    expect(error.message).toBe('Esta ya es la versión actual.');
  });
});
