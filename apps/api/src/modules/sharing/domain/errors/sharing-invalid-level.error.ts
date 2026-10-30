import { InvalidInputError } from '../../../../shared/domain/errors';

/**
 * Compartir con un nivel que no se asigna: `OWNER` nace de la propiedad (DF-31, RN-2) o uno desconocido (CA-2). HTTP
 * 422. El dominio no importa `@nimbo/contracts` (ADR-0008): la prueba ata `code` a `SHARING_ERROR_CODES`.
 */
export class SharingInvalidLevelError extends InvalidInputError {
  readonly code = 'SHARING_INVALID_LEVEL';

  constructor() {
    super('Elige si la persona puede ver o editar.');
  }
}
