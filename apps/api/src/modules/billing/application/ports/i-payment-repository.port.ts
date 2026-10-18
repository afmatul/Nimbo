import type { Actor } from '../../../../shared';
import type { Payment, PaymentDraft } from '../../domain/entities/payment.entity';

/**
 * `transaccion` bajo RLS forzado (plan 009 §3): toma el `EntityManager` de `requireActorScope(actor)`, así que se llama
 * dentro de la transacción del cobro (`withActor`). Solo inserta: las transacciones no se borran ni cambian (RN-7).
 */
export interface IPaymentRepository {
  /** Inserta el pago con la siguiente referencia `SIM-` de la secuencia y lo devuelve con su id. */
  record(actor: Actor, draft: PaymentDraft): Promise<Payment>;
}

export const I_PAYMENT_REPOSITORY = Symbol('IPaymentRepository');
