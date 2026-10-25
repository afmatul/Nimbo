import { DomainError } from '../../../../shared/domain/errors';

/**
 * El proveedor del modelo no respondió a tiempo, falló o no tiene clave (CA-15, RNF-09). HTTP 503 antes del primer
 * evento; a mitad del flujo se traduce al evento `error`. La consulta no se descuenta y el resto de Nimbo sigue
 * (Art. XII). Es el segundo 503 de dominio tras `EditingUnavailableError`: la base común se extrae al tercero (Art. VI.2).
 */
export class AgentUnavailableError extends DomainError {
  readonly code = 'AGENT_UNAVAILABLE';
  readonly status = 503;

  constructor() {
    super(
      'El agente no está disponible. Tus archivos siguen a salvo. Inténtalo de nuevo en unos minutos.',
    );
  }
}
