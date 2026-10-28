import { ConflictError, InvalidInputError } from '../../../../shared/domain/errors';

/**
 * El archivo no es un JPEG ni un PNG por su contenido real: GIF, WebP, PDF, Office, texto, video u «otros», o una
 * extensión de imagen con otro contenido (CA-3, CA-4, RN-1). HTTP 422 y no se crea nada. El dominio no importa
 * `@nimbo/contracts` (ADR-0008): la prueba ata `code` a `OPTIMIZER_ERROR_CODES`.
 */
export class UnsupportedTypeError extends InvalidInputError {
  readonly code = 'OPTIMIZER_UNSUPPORTED_TYPE';

  constructor() {
    super('Solo se pueden optimizar imágenes JPEG y PNG.');
  }
}

/** CA-11, plan §4: no existe una estimación vigente y confirmable para ese archivo. */
export class EstimateStaleError extends ConflictError {
  readonly code = 'OPTIMIZER_ESTIMATE_STALE';

  constructor() {
    super('La estimación ya no está vigente. Calcula el ahorro de nuevo.');
  }
}

/**
 * `sharp` no pudo leer la imagen: firma desconocida, cabecera o datos dañados, JPEG truncado (CA-5, ADR-0036). El
 * resultado es `no_disponible(ilegible)`, sin reintento. Lo lanza `ImageOptimizer` en el `worker`; nunca llega a una
 * respuesta HTTP, por eso no es un `DomainError`. Conserva la causa para la clase del error, nunca su mensaje en el
 * propio (los mensajes de `sharp` no van a las bitácoras, plan 021 §5).
 */
export class UnreadableImageError extends Error {
  constructor(cause: unknown) {
    super('La imagen no se puede leer.', { cause });
    this.name = new.target.name;
  }
}
