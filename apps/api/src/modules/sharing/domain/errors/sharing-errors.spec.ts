import { SHARING_ERROR_CODES } from '@nimbo/contracts';

import { InvalidInputError, NotFoundError } from '../../../../shared/domain/errors';

import {
  CannotShareWithSelfError,
  RecipientNotFoundError,
  ShareNotFoundError,
  SharingInvalidLevelError,
} from './index';

describe('errores de `sharing` (plan 012 §2 y §4)', () => {
  it.each([
    [new SharingInvalidLevelError(), SHARING_ERROR_CODES.SHARING_INVALID_LEVEL, 'ver o editar'],
    [
      new RecipientNotFoundError(),
      SHARING_ERROR_CODES.SHARING_RECIPIENT_NOT_FOUND,
      'pídele que se registre',
    ],
    [
      new CannotShareWithSelfError(),
      SHARING_ERROR_CODES.SHARING_CANNOT_SHARE_WITH_SELF,
      'correo de otra persona',
    ],
  ])('CA-2, CA-3: %p es un 422 con el código del contrato y la acción', (error, code, hint) => {
    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.status).toBe(422);
    expect(error.code).toBe(code);
    expect(error.message).toContain(hint);
  });

  it('CA-11: `ShareNotFoundError` es un 404 que pide actualizar la lista', () => {
    const error = new ShareNotFoundError();

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.status).toBe(404);
    expect(error.code).toBe(SHARING_ERROR_CODES.SHARING_SHARE_NOT_FOUND);
    expect(error.message).toBe('Este acceso ya no existe. Actualiza la lista.');
  });

  it('CA-3, RN-8: el mensaje del destinatario no dice el motivo', () => {
    expect(new RecipientNotFoundError().message).toBe(
      'No encontramos una cuenta de Nimbo con ese correo. Revisa que esté bien escrito o pídele que se registre.',
    );
  });
});
