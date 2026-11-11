import { SHARING_ERROR_CODES } from '@nimbo/contracts';

import { ForbiddenError, InvalidInputError, NotFoundError } from '../../../../shared/domain/errors';

import {
  CannotShareWithSelfError,
  PublicLinkNotFoundError,
  PublicLinkPasswordInvalidError,
  PublicLinkUnavailableError,
  RecipientNotFoundError,
  ShareNotFoundError,
  SharingInvalidLevelError,
  SharingInvalidRequestError,
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

  it('CA-3: `SharingInvalidRequestError` es un 422 con `fields` y el código del contrato', () => {
    const fields = [
      { field: 'email', reason: 'INVALID_EMAIL', message: 'Escribe un correo válido.' },
    ];
    const error = new SharingInvalidRequestError(fields);

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.code).toBe(SHARING_ERROR_CODES.SHARING_INVALID_REQUEST);
    expect(error.fields).toEqual(fields);
  });

  it('CA-3, RN-8: el mensaje del destinatario no dice el motivo', () => {
    expect(new RecipientNotFoundError().message).toBe(
      'No encontramos una cuenta de Nimbo con ese correo. Revisa que esté bien escrito o pídele que se registre.',
    );
  });

  it.each([
    [
      new PublicLinkNotFoundError(),
      SHARING_ERROR_CODES.SHARING_LINK_NOT_FOUND,
      'Este enlace ya no existe. Actualiza para ver el estado actual.',
    ],
    [
      new PublicLinkUnavailableError(),
      SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE,
      'Este enlace ya no está disponible. Pide a quien te lo compartió uno nuevo.',
    ],
  ])(
    '013 CA-8, CA-11: %p es un 404 con el código del contrato y su mensaje',
    (error, code, message) => {
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.status).toBe(404);
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
    },
  );

  it('013 CA-12: `PublicLinkPasswordInvalidError` es un 403 que no dice cuántos intentos quedan (P-3)', () => {
    const error = new PublicLinkPasswordInvalidError();

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.status).toBe(403);
    expect(error.code).toBe(SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID);
    expect(error.message).toBe('La contraseña no es correcta. Revísala y vuelve a intentarlo.');
  });
});
