import { ForbiddenError } from '../../../../shared/domain/errors';

/**
 * La suscripción de pago venció y la cuenta está en solo lectura (spec 010 CA-13, RN-6; ADR-0032): no se sube, crea,
 * renombra, mueve ni restaura. HTTP 403 y nada cambia.
 */
export class AccountReadOnlyError extends ForbiddenError {
  readonly code = 'STORAGE_ACCOUNT_READ_ONLY';

  constructor() {
    super(
      'Tu suscripción venció y tu cuenta está en solo lectura. Renueva tu plan para volver a subir, editar y compartir.',
    );
  }
}
