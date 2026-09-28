import type { FieldIssue } from './field-issue';

/**
 * Base de todo error de dominio (Art. VII.5). La clase concreta fija `code` (estable,
 * `SCREAMING_SNAKE_CASE` con prefijo de módulo, RN-1) y el mensaje en español con acción correctiva;
 * cada clase base intermedia fija el `status` HTTP (spec D-13). `DomainExceptionFilter` (T-18) es
 * el único que lo traduce a una respuesta. `fields` solo existe en errores de entrada (001 CA-5, CA-6).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  readonly fields?: readonly FieldIssue[];

  constructor(message: string, fields?: readonly FieldIssue[]) {
    super(message);
    this.name = new.target.name;
    if (fields !== undefined) {
      this.fields = Object.freeze([...fields]);
    }
  }
}
