import type { UnindexableReason } from '../file-indexing';

/**
 * El contenido de la versión no se puede indexar y reintentar no lo cambia (RN-7, CA-4, CA-5): el resultado es
 * `no_indexable` con `reason`, sin reintento. Lo lanzan los extractores y el pipeline del `worker`; nunca llega a una
 * respuesta HTTP, por eso no es un `DomainError` (no tiene `code` ni estado propios, plan 019 §4).
 */
export class NotIndexableError extends Error {
  constructor(readonly reason: UnindexableReason) {
    super(`La versión no se puede indexar: ${reason}.`);
    this.name = new.target.name;
  }
}
