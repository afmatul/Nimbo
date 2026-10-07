import {
  STORAGE_ERROR_CODES,
  STORAGE_FIELD_ISSUE_REASONS,
  STORAGE_FIELD_MESSAGES,
} from '@nimbo/contracts';

import type { DomainError } from '../../../shared/domain/errors';
import {
  EmptyFileError,
  FileTooLargeError,
  FolderDepthExceededError,
  FolderNameConflictError,
  InvalidMoveError,
  InvalidNodeRequestError,
  InvalidFileTypeError,
  InvalidQueryError,
  InvalidUploadRequestError,
  NameConflictError,
  NodeNotFoundError,
  PreviewUnsupportedError,
  QuickAccessLimitError,
  QuotaExceededError,
  StorageTooManyRequestsError,
  UploadExpiredError,
  UploadIncompleteError,
  UploadNotFoundError,
  UploadSizeMismatchError,
} from '../domain/errors';

const format = (bytes: number): string => String(bytes);

/** Una instancia de cada error de `storage`. El dominio no importa `contracts`: el contrato se prueba aquí. */
const ALL_ERRORS: readonly DomainError[] = [
  new InvalidUploadRequestError([]),
  new InvalidQueryError([]),
  new EmptyFileError(),
  new FileTooLargeError(2n, 1n, format),
  new QuotaExceededError(1n, format),
  new NameConflictError('a (1).txt'),
  new UploadNotFoundError(),
  new UploadExpiredError(),
  new UploadIncompleteError(),
  new UploadSizeMismatchError(),
  new InvalidFileTypeError('signature', 'pdf'),
  new NodeNotFoundError(),
  new StorageTooManyRequestsError(1),
  new InvalidNodeRequestError([]),
  new InvalidMoveError(),
  new FolderDepthExceededError(1, 'place'),
  new QuickAccessLimitError(5),
  new PreviewUnsupportedError(),
];

/** Errores que comparten código con otro ya listado (mismo contrato, distinto mensaje). */
const SHARED_CODE_ERRORS: readonly DomainError[] = [
  new FolderNameConflictError(),
  new FolderDepthExceededError(1, 'restore'),
];

describe('contrato de códigos de `storage` (CA-7, CA-19)', () => {
  it.each([...ALL_ERRORS, ...SHARED_CODE_ERRORS].map((error) => [error.code]))(
    'CA-7: `%s` está en STORAGE_ERROR_CODES',
    (code) => {
      expect(Object.values(STORAGE_ERROR_CODES)).toContain(code);
    },
  );

  it('CA-7: cada código del catálogo tiene su clase de error', () => {
    expect(ALL_ERRORS.map((error) => error.code).sort()).toEqual(
      Object.values(STORAGE_ERROR_CODES).sort(),
    );
  });

  it.each(['INVALID_SORT', 'INVALID_DIRECTION', 'INVALID_CURSOR'])(
    '007 CA-11: `STORAGE_INVALID_QUERY` admite el motivo `%s` con su mensaje en español',
    (reason) => {
      expect(STORAGE_FIELD_ISSUE_REASONS).toContain(reason);
      expect(STORAGE_FIELD_MESSAGES[reason as keyof typeof STORAGE_FIELD_MESSAGES]).toMatch(
        /vuelve a intentarlo\.$|inténtalo de nuevo\.$/,
      );
    },
  );
});
