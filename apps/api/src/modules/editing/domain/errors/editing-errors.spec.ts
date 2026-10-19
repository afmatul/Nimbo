import { ConflictError, DomainError, InvalidInputError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

import {
  EditingSaveInProgressError,
  EditingInvalidRequestError,
  EditingUnavailableError,
  EditingUnsupportedFormatError,
} from './index';

describe('errores de `editing` (plan 016 §2 y §4)', () => {
  it('CA-4: `EditingUnsupportedFormatError` es un 422 que dice qué se puede editar', () => {
    const error = new EditingUnsupportedFormatError();

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('EDITING_UNSUPPORTED_FORMAT');
    expect(error.message).toContain('.docx');
  });

  it('CA-15: `EditingUnavailableError` es un 503 que dice que los archivos siguen a salvo', () => {
    const error = new EditingUnavailableError();

    expect(error).toBeInstanceOf(DomainError);
    expect(error.status).toBe(503);
    expect(error.code).toBe('EDITING_UNAVAILABLE');
    expect(error.message).toContain('Tus archivos siguen a salvo');
  });

  it('CA-9: `EditingSaveInProgressError` es un 409 que pide esperar y volver a abrir', () => {
    const error = new EditingSaveInProgressError();

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('EDITING_SAVE_IN_PROGRESS');
    expect(error.message).toMatch(/vuelve a abrirlo\.$/);
  });

  it('CA-6: `EditingInvalidRequestError` es un 400 con `fields` que pide revisar la petición', () => {
    const issue: FieldIssue = {
      field: 'connectionId',
      reason: 'TOO_SHORT',
      message: 'Revisa el valor.',
    };

    const error = new EditingInvalidRequestError([issue]);

    expect(error).toBeInstanceOf(DomainError);
    expect(error).not.toBeInstanceOf(InvalidInputError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('EDITING_INVALID_REQUEST');
    expect(error.fields).toEqual([issue]);
  });
});
