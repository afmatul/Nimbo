import {
  ConflictError,
  DomainError,
  InvalidInputError,
  NotFoundError,
  TooManyRequestsError,
} from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

import {
  EmptyFileError,
  FileTooLargeError,
  InvalidFileTypeError,
  InvalidQueryError,
  InvalidUploadRequestError,
  NameConflictError,
  NodeNotFoundError,
  QuotaExceededError,
  StorageTooManyRequestsError,
  UploadExpiredError,
  UploadIncompleteError,
  UploadNotFoundError,
  UploadSizeMismatchError,
} from './index';

/** Formateador de prueba: el real es `formatBytes` de `contracts`, inyectado desde la aplicación. */
const format = (bytes: number): string => `${String(bytes)} B`;

const NAME_ISSUE: FieldIssue = {
  field: 'name',
  reason: 'REQUIRED',
  message: 'Completa este campo.',
};

describe('errores de `storage` (plan §5)', () => {
  it('CA-7: `InvalidUploadRequestError` es un 400 con `fields` (no el 422 de `InvalidInputError`)', () => {
    const error = new InvalidUploadRequestError([NAME_ISSUE]);

    expect(error).toBeInstanceOf(DomainError);
    expect(error).not.toBeInstanceOf(InvalidInputError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('STORAGE_INVALID_UPLOAD_REQUEST');
    expect(error.fields).toEqual([NAME_ISSUE]);
    expect(error.message).toMatch(/\.$/);
  });

  it('CA-7: `InvalidQueryError` es un 400 con `fields`', () => {
    const issue: FieldIssue = { field: 'cursor', reason: 'INVALID_CURSOR', message: 'x.' };
    const error = new InvalidQueryError([issue]);

    expect(error).not.toBeInstanceOf(InvalidInputError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('STORAGE_INVALID_QUERY');
    expect(error.fields).toEqual([issue]);
  });

  it('CA-7: `EmptyFileError` es un 422 con el mensaje de spec §9', () => {
    const error = new EmptyFileError();

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('STORAGE_EMPTY_FILE');
    expect(error.message).toBe(
      'El archivo está vacío. Revisa que tenga contenido y súbelo de nuevo.',
    );
  });

  it('CA-3: `FileTooLargeError` arma el mensaje con el formateador y lleva las cifras en `details`', () => {
    const error = new FileTooLargeError(52_400_000n, 50_000_000n, format);

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.code).toBe('STORAGE_FILE_TOO_LARGE');
    expect(error.message).toBe(
      'Este archivo pesa 52400000 B y tu plan permite hasta 50000000 B por archivo. ' +
        'Reduce su tamaño o cambia de plan.',
    );
    expect(error.details).toEqual({ sizeBytes: 52_400_000, maxBytes: 50_000_000 });
  });

  it('CA-4: `QuotaExceededError` dice cuánto falta y lo lleva en `details`', () => {
    const error = new QuotaExceededError(30n, format);

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.code).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(error.message).toBe(
      'Te faltan 30 B de espacio para subir este archivo. Libera espacio o cambia de plan.',
    );
    expect(error.details).toEqual({ missingBytes: 30 });
  });

  it('014 CA-12: al restaurar, `QuotaExceededError` habla de la versión con el mismo código y `details`', () => {
    const error = new QuotaExceededError(30n, format, 'restore');

    expect(error.code).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(error.message).toBe(
      'Te faltan 30 B de espacio para restaurar esta versión. Libera espacio o cambia de plan.',
    );
    expect(error.details).toEqual({ missingBytes: 30 });
  });

  it('CA-5: `UploadSizeMismatchError` es un 422 sin parámetros con el texto aprobado', () => {
    const error = new UploadSizeMismatchError();

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error.code).toBe('STORAGE_UPLOAD_SIZE_MISMATCH');
    expect(error.message).toBe('El archivo cambió durante la carga. Vuelve a subirlo.');
    expect(error.details).toBeUndefined();
  });

  it.each(['signature', 'text'] as const)(
    'CA-11: `InvalidFileTypeError` (%s) nombra la extensión',
    (reason) => {
      const error = new InvalidFileTypeError(reason, 'docx');

      expect(error).toBeInstanceOf(InvalidInputError);
      expect(error.code).toBe('STORAGE_INVALID_FILE_TYPE');
      expect(error.message).toBe(
        'Este archivo no es un .docx válido. Comprueba que sea el archivo correcto.',
      );
      expect(error.details).toEqual({ reason, extension: 'docx' });
    },
  );

  it('CA-24: `InvalidFileTypeError` de un ejecutable usa su propio mensaje', () => {
    const error = new InvalidFileTypeError('executable', 'pdf');

    expect(error.message).toBe('No se permiten archivos ejecutables. Sube otro archivo.');
    expect(error.details).toEqual({ reason: 'executable', extension: 'pdf' });
  });

  it('CA-6: `NameConflictError` es un 409 con `suggestedName`, sin el nombre en el mensaje', () => {
    const error = new NameConflictError('informe (1).docx');

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('STORAGE_NAME_CONFLICT');
    expect(error.suggestedName).toBe('informe (1).docx');
    expect(error.details).toEqual({ suggestedName: 'informe (1).docx' });
    expect(error.message).not.toContain('informe');
  });

  it('014 CA-15: con la versión que podaría un reemplazo, la suma a `details` como `wouldPruneVersion`', () => {
    const error = new NameConflictError('informe (1).docx', 2);

    expect(error.details).toEqual({ suggestedName: 'informe (1).docx', wouldPruneVersion: 2 });
  });

  it('CA-10: `UploadIncompleteError` es un 409', () => {
    const error = new UploadIncompleteError();

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe('STORAGE_UPLOAD_INCOMPLETE');
  });

  it.each([
    [new UploadNotFoundError(), 'STORAGE_UPLOAD_NOT_FOUND'],
    [new NodeNotFoundError(), 'STORAGE_NODE_NOT_FOUND'],
  ])('CA-16: %p es un 404', (error, code) => {
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.status).toBe(404);
    expect(error.code).toBe(code);
  });

  it('CA-9: `UploadExpiredError` es un 410 con el mensaje de spec §9', () => {
    const error = new UploadExpiredError();

    expect(error).toBeInstanceOf(DomainError);
    expect(error.status).toBe(410);
    expect(error.code).toBe('STORAGE_UPLOAD_EXPIRED');
    expect(error.message).toBe('Esta carga caducó. Vuelve a subir el archivo.');
  });

  it('CA-19: `StorageTooManyRequestsError` es un 429 con `retryAfterSeconds`', () => {
    const error = new StorageTooManyRequestsError(12);

    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(12);
    expect(error.code).toBe('STORAGE_TOO_MANY_REQUESTS');
    expect(error.message).toBe(
      'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    );
  });

  it('todo mensaje termina en punto (acción correctiva en español)', () => {
    const errors: DomainError[] = [
      new InvalidUploadRequestError([NAME_ISSUE]),
      new InvalidQueryError([NAME_ISSUE]),
      new NameConflictError('a (1).txt'),
      new UploadIncompleteError(),
      new UploadNotFoundError(),
      new NodeNotFoundError(),
    ];

    for (const error of errors) expect(error.message).toMatch(/\.$/);
  });
});
