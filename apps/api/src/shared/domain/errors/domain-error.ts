import type { FieldIssue } from './field-issue';

/**
 * Datos del error que la respuesta lleva en `details` (005 D-12): objeto plano de texto, número o booleano (cifras,
 * `suggestedName`, `reason`). Estructuralmente igual a `ErrorResponse.details`; el dominio no importa `contracts`.
 * Nunca se registra en bitácoras: puede llevar un nombre de archivo (CA-20).
 */
export type ErrorDetails = Readonly<Record<string, string | number | boolean>>;

/**
 * Base de todo error de dominio (Art. VII.5). La clase concreta fija `code` (estable,
 * `SCREAMING_SNAKE_CASE` con prefijo de módulo, RN-1) y el mensaje en español con acción correctiva;
 * cada clase base intermedia fija el `status` HTTP (spec D-13). `DomainExceptionFilter` (T-18) es
 * el único que lo traduce a una respuesta. `fields` solo existe en errores de entrada (001 CA-5, CA-6);
 * `details`, en los que la interfaz necesita datos para armar su mensaje (005 D-12).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  readonly fields?: readonly FieldIssue[];
  readonly details?: ErrorDetails;

  constructor(message: string, fields?: readonly FieldIssue[], details?: ErrorDetails) {
    super(message);
    this.name = new.target.name;
    if (fields !== undefined) {
      this.fields = Object.freeze([...fields]);
    }
    if (details !== undefined) {
      this.details = Object.freeze({ ...details });
    }
  }
}
