/** `retryable: false` cuando reintentar no cambia nada (sin clave configurada, CA-12). */
export interface EmbeddingUnavailableOptions {
  readonly retryable: boolean;
}

/**
 * El proveedor de embeddings no respondió (429, 5xx, red) o no está configurado (CA-12, RN-6). Por defecto es
 * transitorio y la cola reintenta; agotados los intentos, o si no es reintentable, la indexación queda `fallido` con
 * `proveedor_no_disponible`. Nunca lleva la clave ni el cuerpo de la respuesta (CA-21). Interno del `worker`: no es un
 * `DomainError` (plan 019 §4).
 */
export class EmbeddingUnavailableError extends Error {
  readonly reason = 'proveedor_no_disponible';
  readonly retryable: boolean;

  constructor(options: EmbeddingUnavailableOptions = { retryable: true }) {
    super('El proveedor de embeddings no está disponible.');
    this.name = new.target.name;
    this.retryable = options.retryable;
  }
}
