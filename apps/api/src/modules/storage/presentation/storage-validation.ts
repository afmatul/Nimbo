import { ParseUUIDPipe } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { quickAccessNodePathSchema } from '@nimbo/contracts';
import type { QuickAccessNodePath } from '@nimbo/contracts';

import type { DomainError, FieldIssue, InvalidInputFactory } from '../../../shared';
import {
  InvalidNodeRequestError,
  InvalidQueryError,
  InvalidUploadRequestError,
  NodeNotFoundError,
  UploadNotFoundError,
  VersionNotFoundError,
} from '../domain/errors';
import type { StorageNode } from '../domain/storage-node';

/** Fábrica de `ZodValidationPipe` para `POST /uploads`: 400 `STORAGE_INVALID_UPLOAD_REQUEST` con `fields` (CA-7). */
export const storageUploadValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new InvalidUploadRequestError(issues);

/** Fábrica de `ZodValidationPipe` para crear, renombrar o mover nodos: 400 `STORAGE_INVALID_NODE_REQUEST` (006 CA-2). */
export const storageNodeValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new InvalidNodeRequestError(issues);

/** Fábrica de `ZodValidationPipe` para las consultas paginadas: 400 `STORAGE_INVALID_QUERY` con `fields`. */
export const storageQueryValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new InvalidQueryError(issues);

/**
 * `:uploadId` que no es UUID: el mismo 404 que una carga inexistente, antes de llegar al servicio (CA-16: sin
 * oráculo entre «malformado», «ajeno» e «inexistente»).
 */
export const uploadIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new UploadNotFoundError() });

/** `:fileId` o `:folderId` que no es UUID: el mismo 404 que un nodo inexistente o ajeno (CA-16, 006 CA-5). */
export const nodeIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new NodeNotFoundError() });

/** `:versionId` que no es UUID: el mismo 404 que una versión inexistente, podada o de otro archivo (014 CA-11). */
export const versionIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new VersionNotFoundError() });

const NODE_TYPE_BY_PATH: Readonly<Record<QuickAccessNodePath, StorageNode['type']>> = {
  files: 'file',
  folders: 'folder',
};

/**
 * `:nodeType` de `/quick-access/{pins|recents}/:nodeType/:nodeId` (`files` | `folders`, como `/trash/{files|folders}`)
 * al tipo de nodo. Otro valor es el mismo 404 que un nodo inexistente (006 CA-22, CA-28).
 */
export class NodeTypePipe implements PipeTransform<string, StorageNode['type']> {
  transform(value: string): StorageNode['type'] {
    const parsed = quickAccessNodePathSchema.safeParse(value);
    if (!parsed.success) throw new NodeNotFoundError();
    return NODE_TYPE_BY_PATH[parsed.data];
  }
}
