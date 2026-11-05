import { NotFoundError } from '../../../../shared/domain/errors';

/**
 * El visitante usa un enlace que no sirve (013 CA-11): token inexistente, mal formado, revocado, reemplazado o vencido,
 * archivo en la papelera o purgado, propietario suspendido, o un cuerpo inválido (plan D-4). HTTP 404 con el mismo
 * cuerpo en todos los casos (P-1): no revela cuál es.
 */
export class PublicLinkUnavailableError extends NotFoundError {
  readonly code = 'SHARING_LINK_UNAVAILABLE';

  constructor() {
    super('Este enlace ya no está disponible. Pide a quien te lo compartió uno nuevo.');
  }
}
