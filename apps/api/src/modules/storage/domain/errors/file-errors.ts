import { ConflictError, NotFoundError } from '../../../../shared/domain/errors';

const NAME_CONFLICT_MESSAGE =
  'Ya tienes un archivo con ese nombre. Elige «Conservar ambos» o cancela la carga.';

/**
 * Ya hay un archivo con ese nombre en la raíz (CA-6). HTTP 409 con `suggestedName` en `details`. El mensaje no lleva
 * el nombre: la interfaz arma el diálogo con `details`.
 */
export class NameConflictError extends ConflictError {
  readonly code = 'STORAGE_NAME_CONFLICT';

  constructor(readonly suggestedName: string) {
    super(NAME_CONFLICT_MESSAGE, undefined, { suggestedName });
  }
}

/** El archivo no existe o no es accesible para el actor (CA-16). HTTP 404, idéntico en ambos casos. */
export class NodeNotFoundError extends NotFoundError {
  readonly code = 'STORAGE_NODE_NOT_FOUND';

  constructor() {
    super('No encontramos este archivo. Actualiza la lista para ver tus archivos.');
  }
}
