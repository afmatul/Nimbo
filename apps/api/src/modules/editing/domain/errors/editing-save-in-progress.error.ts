import { ConflictError } from '../../../../shared/domain/errors';

/**
 * Abrir un documento cuya sesión anterior se está guardando (plan 016 §4): editar ahora sería trabajar sobre una
 * versión que está por dejar de ser la vigente. HTTP 409.
 */
export class EditingSaveInProgressError extends ConflictError {
  readonly code = 'EDITING_SAVE_IN_PROGRESS';

  constructor() {
    super(
      'Estamos guardando los cambios de la sesión anterior de este documento. Espera unos segundos y vuelve a abrirlo.',
    );
  }
}
