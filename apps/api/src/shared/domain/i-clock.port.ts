/** Puerto del reloj (Art. V.2a): el dominio nunca llama a `new Date()` directamente. */
export interface IClock {
  now(): Date;
}

export const I_CLOCK: unique symbol = Symbol('IClock');
