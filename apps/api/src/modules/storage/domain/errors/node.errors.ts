import { ConflictError, DomainError, InvalidInputError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

/** `storage` responde la forma inválida con `400` (005 plan §5), no con el `422` de `shared`. */
const BAD_REQUEST = 400;

/** Crear, renombrar o mover un nodo con una petición mal formada (CA-2). HTTP 400 con `fields`. */
export class InvalidNodeRequestError extends DomainError {
  readonly code = 'STORAGE_INVALID_NODE_REQUEST';
  readonly status = BAD_REQUEST;

  constructor(fields: readonly FieldIssue[]) {
    super('Revisa el nombre y vuelve a intentarlo.', fields);
  }
}

/**
 * Ya hay una carpeta viva con ese nombre en el destino (CA-3). HTTP 409 sin `suggestedName`: las carpetas no se
 * renombran solas ni se fusionan. Como en 005, el mensaje no lleva el nombre; la interfaz lo agrega.
 */
export class FolderNameConflictError extends ConflictError {
  readonly code = 'STORAGE_NAME_CONFLICT';

  constructor() {
    super('Ya existe una carpeta con ese nombre aquí. Elige otro nombre.');
  }
}

/** Mover una carpeta dentro de sí misma o de una descendiente (CA-8). HTTP 422. */
export class InvalidMoveError extends InvalidInputError {
  readonly code = 'STORAGE_INVALID_MOVE';

  constructor() {
    super('No puedes mover una carpeta dentro de sí misma.');
  }
}

/** Operación que superó la profundidad: crear o mover (CA-9) o restaurar (CA-15). Solo cambia el mensaje. */
export type FolderDepthOperation = 'place' | 'restore';

function depthMessage(maxDepth: number, operation: FolderDepthOperation): string {
  const levels = String(maxDepth);
  return operation === 'place'
    ? `Llegaste al máximo de ${levels} niveles de carpetas. Crea la carpeta en otro lugar.`
    : `No podemos restaurar este elemento aquí porque superaría ${levels} niveles de carpetas. ` +
        'Mueve la carpeta original a un nivel más alto y vuelve a intentarlo.';
}

/** El árbol quedaría más hondo que `FOLDER_MAX_DEPTH` (CA-9, CA-15). HTTP 422 con `details.maxDepth`. */
export class FolderDepthExceededError extends InvalidInputError {
  readonly code = 'STORAGE_FOLDER_DEPTH_EXCEEDED';

  constructor(maxDepth: number, operation: FolderDepthOperation) {
    super(depthMessage(maxDepth, operation), undefined, { maxDepth });
  }
}
