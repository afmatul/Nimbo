import type { Money } from '../value-objects/money';

/** Resultado del cobro en la pasarela (columna `transaccion.estado`). */
export type PaymentStatus = 'aprobada' | 'rechazada';

/** Lo que el cobro registra antes de tener id y referencia (spec 009 plan §3, `transaccion`). */
export interface PaymentDraft {
  readonly planId: string;
  readonly amount: Money;
  readonly status: PaymentStatus;
  readonly cardBrand: string;
  readonly cardLast4: string;
  readonly createdAt: Date;
}

/** Una fila de `transaccion`: aprobada o rechazada, nunca se borra (RN-7). */
export interface Payment extends PaymentDraft {
  readonly id: string;
  readonly userId: string;
  readonly reference: string;
}
