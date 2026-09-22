/**
 * Base de todo error de dominio (Art. VII.5). La clase concreta fija `code` (estable,
 * `SCREAMING_SNAKE_CASE` con prefijo de módulo, RN-1) y el mensaje en español con acción correctiva;
 * cada clase base intermedia fija el `status` HTTP (spec D-13). `DomainExceptionFilter` (T-18) es
 * el único que lo traduce a una respuesta.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
