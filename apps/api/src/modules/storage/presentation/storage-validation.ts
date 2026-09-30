import { ParseUUIDPipe } from '@nestjs/common';

import type { DomainError, FieldIssue, InvalidInputFactory } from '../../../shared';
import {
  InvalidQueryError,
  InvalidUploadRequestError,
  NodeNotFoundError,
  UploadNotFoundError,
} from '../domain/errors';

/** Fábrica de `ZodValidationPipe` para `POST /uploads`: 400 `STORAGE_INVALID_UPLOAD_REQUEST` con `fields` (CA-7). */
export const storageUploadValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new InvalidUploadRequestError(issues);

/** Fábrica de `ZodValidationPipe` para `GET /files`: 400 `STORAGE_INVALID_QUERY` con `fields`. */
export const storageQueryValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new InvalidQueryError(issues);

/**
 * `:uploadId` que no es UUID: el mismo 404 que una carga inexistente, antes de llegar al servicio (CA-16: sin
 * oráculo entre «malformado», «ajeno» e «inexistente»).
 */
export const uploadIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new UploadNotFoundError() });

/** `:fileId` que no es UUID: el mismo 404 que un archivo inexistente o ajeno (CA-16). */
export const fileIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new NodeNotFoundError() });
