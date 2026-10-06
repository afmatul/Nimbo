import { ConflictError, DomainError, InvalidInputError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

import {
  FolderDepthExceededError,
  FolderNameConflictError,
  InvalidMoveError,
  InvalidNodeRequestError,
} from './index';

const NAME_ISSUE: FieldIssue = {
  field: 'name',
  reason: 'REQUIRED',
  message: 'Completa este campo.',
};

describe('errores de carpetas y papelera (plan 006 §2)', () => {
  it('CA-2: `InvalidNodeRequestError` es un 400 con `fields`', () => {
    const error = new InvalidNodeRequestError([NAME_ISSUE]);

    expect(error).toBeInstanceOf(DomainError);
    expect(error).not.toBeInstanceOf(InvalidInputError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('STORAGE_INVALID_NODE_REQUEST');
    expect(error.fields).toEqual([NAME_ISSUE]);
  });

  it('CA-3: `FolderNameConflictError` es un 409 sin `suggestedName` y sin el nombre en el mensaje', () => {
    const error = new FolderNameConflictError();

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('STORAGE_NAME_CONFLICT');
    expect(error.details).toBeUndefined();
    expect(error.message).toBe('Ya existe una carpeta con ese nombre aquí. Elige otro nombre.');
  });

  it('CA-8: `InvalidMoveError` es un 422 con el texto de la spec', () => {
    const error = new InvalidMoveError();

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.code).toBe('STORAGE_INVALID_MOVE');
    expect(error.message).toBe('No puedes mover una carpeta dentro de sí misma.');
  });

  it('CA-9: `FolderDepthExceededError` al crear o mover nombra el máximo y lo lleva en `details`', () => {
    const error = new FolderDepthExceededError(10, 'place');

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.code).toBe('STORAGE_FOLDER_DEPTH_EXCEEDED');
    expect(error.message).toBe(
      'Llegaste al máximo de 10 niveles de carpetas. Crea la carpeta en otro lugar.',
    );
    expect(error.details).toEqual({ maxDepth: 10 });
  });

  it('CA-15: `FolderDepthExceededError` al restaurar sugiere mover la carpeta original, sin nombres', () => {
    const error = new FolderDepthExceededError(10, 'restore');

    expect(error.code).toBe('STORAGE_FOLDER_DEPTH_EXCEEDED');
    expect(error.message).toBe(
      'No podemos restaurar este elemento aquí porque superaría 10 niveles de carpetas. ' +
        'Mueve la carpeta original a un nivel más alto y vuelve a intentarlo.',
    );
    expect(error.details).toEqual({ maxDepth: 10 });
  });
});
