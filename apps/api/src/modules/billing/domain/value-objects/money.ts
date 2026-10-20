/**
 * Dinero en centavos enteros de GTQ (spec 009 RN-1, ADR-0016, DF-23). Solo guarda y valida: el desglose de IVA es
 * `breakdown` de `contracts`, que llaman los servicios de aplicación (el dominio no importa `contracts`).
 */
export class Money {
  private constructor(readonly cents: number) {}

  static ofCents(cents: number): Money {
    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new RangeError('El monto debe ser una cantidad entera y no negativa de centavos.');
    }
    return new Money(cents);
  }
}
