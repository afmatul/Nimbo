/**
 * Invariante de `billing` violado por la propia aplicación (Art. VII.5): no es un `DomainError`, así que el filtro HTTP
 * lo trata como error interno y no expone nada al cliente.
 */
export class BillingInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
