import { SHARED_ERROR_CODES, SHARING_ERROR_CODES, STORAGE_ERROR_CODES } from '@nimbo/contracts';

import { StorageRequestError } from '../storage/storage-request-error';

import { shareMessageOf, SHARE_FIX_LABELS } from './share-messages';

const failure = (status: number, code: string, details = {}): StorageRequestError =>
  new StorageRequestError(status, code, details);

describe('catálogo de mensajes de compartir (spec 012b RN-2)', () => {
  it.each([
    [
      failure(422, SHARING_ERROR_CODES.SHARING_RECIPIENT_NOT_FOUND),
      'No encontramos una cuenta de Nimbo con ese correo. Revisa que esté bien escrito o pídele que se registre.',
      'fix_email',
    ],
    [
      failure(422, SHARING_ERROR_CODES.SHARING_CANNOT_SHARE_WITH_SELF),
      'Este elemento ya es tuyo. Escribe el correo de otra persona.',
      'fix_email',
    ],
    [
      failure(422, SHARING_ERROR_CODES.SHARING_INVALID_LEVEL),
      'Elige si la persona puede ver o editar.',
      'retry',
    ],
    [
      failure(404, SHARING_ERROR_CODES.SHARING_SHARE_NOT_FOUND),
      'Este acceso ya no existe. Actualiza la lista.',
      'refresh',
    ],
    [
      failure(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND),
      'No encontramos este elemento. Puede que ya no exista o esté en la papelera. Actualiza la lista.',
      'refresh',
    ],
    [
      failure(403, STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY),
      'Tu suscripción venció y tu cuenta está en solo lectura. Renueva tu plan para volver a subir, editar y compartir.',
      'renew',
    ],
  ])('CA-3, CA-11: %p tiene su texto y su acción', (error, title, fix) => {
    expect(shareMessageOf(error)).toEqual({ title, fix });
  });

  it('CA-3: un 429 dice cuántos minutos esperar según `Retry-After`', () => {
    const error = failure(429, SHARED_ERROR_CODES.TOO_MANY_REQUESTS, { retryAfterSeconds: 180 });

    expect(shareMessageOf(error)).toEqual({
      title: 'Hiciste demasiados intentos. Espera 3 minutos e inténtalo de nuevo.',
      fix: 'wait',
    });
  });

  it('CA-3: un correo mal formado usa el texto del campo y pide corregirlo', () => {
    const error = new StorageRequestError(422, SHARING_ERROR_CODES.SHARING_INVALID_REQUEST, {}, [
      { field: 'email', reason: 'INVALID_EMAIL', message: 'x' },
    ]);

    expect(shareMessageOf(error)).toEqual({
      title: 'Escribe un correo válido, por ejemplo nombre@dominio.com.',
      fix: 'fix_email',
    });
  });

  it('CA-11: sin conexión o con un código desconocido, pide revisar la conexión y reintentar', () => {
    const expected = {
      title: 'No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo.',
      fix: 'retry',
    };

    expect(shareMessageOf(new TypeError('Failed to fetch'))).toEqual(expected);
    expect(shareMessageOf(failure(500, 'INTERNAL_ERROR'))).toEqual(expected);
  });

  it('CA-3: cada acción correctiva tiene su rótulo, salvo esperar', () => {
    expect(SHARE_FIX_LABELS).toEqual({
      retry: 'Reintentar',
      fix_email: 'Corregir el correo',
      renew: 'Renovar plan',
      refresh: 'Actualizar lista',
      wait: null,
    });
  });
});
