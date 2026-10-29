import { NotFoundError } from '../../../../shared/domain/errors';

/**
 * El ámbito de la pregunta (carpeta o archivo) no existe o no es accesible para quien pregunta (CA-17, RN-9). HTTP 404
 * idéntico en ambos casos: no revela si el id pertenece a otra cuenta.
 */
export class AgentScopeNotFoundError extends NotFoundError {
  readonly code = 'AGENT_SCOPE_NOT_FOUND';

  constructor() {
    super(
      'No encontramos esa carpeta o archivo. Pregunta sobre todos tus archivos o elige otro ámbito.',
    );
  }
}
