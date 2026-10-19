import { DomainError } from '../../../../shared/domain/errors';

/**
 * El servicio de edición no responde o no está configurado (CA-15, RNF-09). HTTP 503: el resto de Nimbo sigue
 * funcionando (Art. XII). Es el único 503 de dominio; si aparece un segundo, se extrae la base a `shared`.
 */
export class EditingUnavailableError extends DomainError {
  readonly code = 'EDITING_UNAVAILABLE';
  readonly status = 503;

  constructor() {
    super(
      'El editor no está disponible. Tus archivos siguen a salvo; inténtalo de nuevo en unos minutos.',
    );
  }
}
