/**
 * No se pudo leer el contenido de la versión desde el almacenamiento de objetos (CA-12): es transitorio y la cola
 * reintenta; agotados los intentos, la indexación queda `fallido` con `lectura_fallida`. Conserva la causa para la
 * clase del error en la bitácora, nunca el contenido ni la clave del objeto (CA-21). Interno del `worker`.
 */
export class ContentReadError extends Error {
  readonly reason = 'lectura_fallida';

  constructor(cause: unknown) {
    super('No se pudo leer el contenido de la versión.', { cause });
    this.name = new.target.name;
  }
}
